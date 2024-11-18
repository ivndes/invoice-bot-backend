require('dotenv').config();
const express = require('express');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const port = process.env.PORT || 3000;

// Инициализация бота
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { 
    polling: false
});

// CORS настройки
app.use(cors({
    origin: 'https://ivndes.github.io',
    methods: ['GET', 'POST'],
    credentials: true
}));

app.use(express.json());

// Функция генерации PDF
async function generatePDF(invoiceData) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument();
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));

        doc.fontSize(25).text('Invoice', { align: 'center' });
        
        doc.moveDown();
        doc.fontSize(14)
           .text('From:', { underline: true })
           .text(`Name: ${invoiceData.yourInfo.name}`)
           .text(`Email: ${invoiceData.yourInfo.email}`);

        doc.moveDown()
           .text('To:', { underline: true })
           .text(`Name: ${invoiceData.clientInfo.name}`)
           .text(`Email: ${invoiceData.clientInfo.email}`);

        doc.moveDown()
           .text('Items:', { underline: true });
        
        let total = 0;
        invoiceData.items.forEach(item => {
            doc.text(`${item.description}`);
            doc.text(`   Amount: ${item.amount} × Price: $${item.price} = $${item.total}`, { indent: 20 });
            total += item.total;
        });

        doc.moveDown();
        doc.fontSize(16).text(`Total: $${total.toFixed(2)}`, { align: 'right' });

        doc.end();
    });
}

// Основные эндпоинты
app.post('/generate-invoice', async (req, res) => {
    try {
        console.log('Generate invoice request:', req.body);
        const { invoiceData, chatId, payment_status } = req.body;
        
        if (payment_status !== 'paid') {
            return res.status(402).json({ success: false, error: 'Payment required' });
        }
        
        const pdfBuffer = await generatePDF(invoiceData);
        
        // Сначала отправляем документ как файл
        const sentDocument = await bot.sendDocument(chatId, pdfBuffer, {
            filename: 'invoice.pdf',
            caption: 'Here is your generated invoice!'
        });

        // Получаем информацию о файле
        if (sentDocument && sentDocument.document) {
            const fileInfo = await bot.getFile(sentDocument.document.file_id);
            console.log('File info:', fileInfo);

            // Формируем прямую ссылку на файл
            const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;
            
            res.json({ 
                success: true, 
                message: 'Invoice generated and sent successfully',
                fileUrl: fileUrl,
                fileInfo: fileInfo
            });
        } else {
            throw new Error('Failed to get file information');
        }
    } catch (error) {
        console.error('Error generating invoice:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// В index.js замените endpoint /create-invoice на:
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

// И добавьте более подробное логирование в webhook endpoint:
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

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ status: 'Server is running' });
});

// Запускаем сервер
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

// Обработка ошибок
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