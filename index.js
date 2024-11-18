require('dotenv').config();
const express = require('express');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const port = process.env.PORT || 3000;

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { 
    polling: false
});

app.use(cors({
    origin: 'https://ivndes.github.io',
    methods: ['GET', 'POST'],
    credentials: true
}));

app.use(express.json());

async function generatePDF(invoiceData) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            margins: {
                top: 50,
                bottom: 50,
                left: 50,
                right: 50
            },
            info: {
                Title: 'Invoice',
                Author: 'Invoice Generator Bot',
                Creator: '@makeinvoicesbot', // Замените на username вашего бота
                Producer: 'https://t.me/makeinvoicesbot', // Замените на ссылку на вашего бота
                Keywords: 'invoice, telegram, bot'
            }
        });

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));

        // Heading
        doc.fontSize(24)
           .font('Helvetica-Bold')
           .text('INVOICE', { align: 'center' });

        doc.moveDown(2);

        // From section
        doc.fontSize(12)
           .font('Helvetica')
           .text('FROM:', { underline: true })
           .font('Helvetica-Bold')
           .text(invoiceData.yourInfo.name)
           .font('Helvetica')
           .text(invoiceData.yourInfo.email);

        doc.moveDown(2);

        // Bill To section
        doc.fontSize(12)
           .font('Helvetica')
           .text('BILL TO:', { underline: true })
           .font('Helvetica-Bold')
           .text(invoiceData.clientInfo.name)
           .font('Helvetica')
           .text(invoiceData.clientInfo.email);

        doc.moveDown(2);

        // Current date
        doc.text(`Issued on: ${new Date().toLocaleDateString()}`, { align: 'right' });

        doc.moveDown();

        // Items table header
        const tableTop = doc.y + 20;
        doc.font('Helvetica-Bold')
           .text('DESCRIPTION', 50, tableTop)
           .text('RATE', 280, tableTop)
           .text('QTY', 370, tableTop)
           .text('AMOUNT', 450, tableTop);

        doc.moveDown();

        // Items
        let yPosition = doc.y + 20;
        let total = 0;

        invoiceData.items.forEach(item => {
            const itemTotal = item.amount * item.price;
            total += itemTotal;

            doc.font('Helvetica')
               .text(item.description, 50, yPosition)
               .text(`$${item.price.toFixed(2)}`, 280, yPosition)
               .text(item.amount.toString(), 370, yPosition)
               .text(`$${itemTotal.toFixed(2)}`, 450, yPosition);

            yPosition += 30;
        });

        // Total
        doc.moveDown(2)
           .font('Helvetica-Bold')
           .text(`Total Amount: $${total.toFixed(2)}`, { align: 'right' });

        doc.end();
    });
}

app.post('/generate-invoice', async (req, res) => {
    try {
        const { invoiceData, chatId, payment_status } = req.body;
        
        if (payment_status !== 'paid') {
            return res.status(402).json({ success: false, error: 'Payment required' });
        }
        
        // Генерируем уникальный хеш для имени файла
        const hash = require('crypto')
            .createHash('md5')
            .update(`${Date.now()}-${chatId}`)
            .digest('hex')
            .substring(0, 8);
        
        const pdfBuffer = await generatePDF(invoiceData);
        
        // Отправляем файл в чат с уникальным именем
        await bot.sendDocument(chatId, pdfBuffer, {
            filename: `Invoice_${hash}.pdf`,
            caption: 'Here is your generated invoice!'
        });

        res.json({ success: true, message: 'Invoice generated and sent successfully' });
    } catch (error) {
        console.error('Error generating invoice:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/create-invoice', async (req, res) => {
    try {
        const { chatId } = req.body;
        console.log('Creating invoice for chat ID:', chatId);
        
        const invoiceLink = await bot.createInvoiceLink(
            'Generate Invoice PDF',
            'Generate a professional PDF invoice with your data',
            `invoice_${Date.now()}`,
            '', // empty provider_token for digital goods
            'XTR',
            [{
                label: 'Invoice Generation',
                amount: 1 // 1 звезда = 100
            }],
            {
                need_name: false,
                need_phone_number: false,
                need_email: false,
                need_shipping_address: false,
                is_flexible: false,
                protect_content: true
            }
        );

        console.log('Invoice link created:', invoiceLink);
        res.json({ success: true, invoice_url: invoiceLink });
    } catch (error) {
        console.error('Error creating invoice:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post(`/webhook/${process.env.TELEGRAM_BOT_TOKEN}`, async (req, res) => {
    try {
        console.log('Webhook received:', JSON.stringify(req.body, null, 2));
        const { pre_checkout_query, message } = req.body;
        
        if (pre_checkout_query) {
            console.log('Processing pre-checkout:', pre_checkout_query);
            await bot.answerPreCheckoutQuery(pre_checkout_query.id, true);
            console.log('Pre-checkout approved');
        }
        
        if (message?.successful_payment) {
            console.log('Processing successful payment:', message.successful_payment);
            // Здесь можно добавить дополнительную логику при успешной оплате
        }
        
        res.sendStatus(200);
    } catch (error) {
        console.error('Webhook error:', error);
        res.sendStatus(500);
    }
});

app.get('/', (req, res) => {
    res.json({ status: 'Server is running' });
});

const server = app.listen(port, async () => {
    console.log(`Server running on port ${port}`);
    try {
        // Устанавливаем вебхук после запуска сервера
        const webhookUrl = `https://invoice-bot-backend.onrender.com/webhook/${process.env.TELEGRAM_BOT_TOKEN}`;
        await bot.setWebHook(webhookUrl);
        console.log('Webhook set to:', webhookUrl);
    } catch (error) {
        console.error('Error setting webhook:', error);
    }
});

server.on('error', (error) => {
    console.error('Server error:', error);
    if (error.code === 'EADDRINUSE') {
        console.log('Port is busy, trying again...');
        setTimeout(() => {
            server.close();
            server.listen(port);
        }, 1000);
    }
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});