require('dotenv').config();
const express = require('express');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const port = process.env.PORT || 3000;

// Инициализация бота
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { 
    polling: false,
    webHook: {
        port: port
    }
});

const url = 'https://invoice-bot-backend.onrender.com';
bot.setWebHook(`${url}/webhook/${process.env.TELEGRAM_BOT_TOKEN}`);

// Обновленные CORS настройки
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

        // Добавляем содержимое в PDF
        doc.fontSize(25).text('Invoice', { align: 'center' });
        
        // Информация о вас
        doc.moveDown();
        doc.fontSize(14)
           .text('From:', { underline: true })
           .text(`Name: ${invoiceData.yourInfo.name}`)
           .text(`Email: ${invoiceData.yourInfo.email}`);

        // Информация о клиенте
        doc.moveDown()
           .text('To:', { underline: true })
           .text(`Name: ${invoiceData.clientInfo.name}`)
           .text(`Email: ${invoiceData.clientInfo.email}`);

        // Информация о товарах
        doc.moveDown()
           .text('Items:', { underline: true });
        
        let total = 0;
        invoiceData.items.forEach(item => {
            doc.text(`${item.description}`);
            doc.text(`   Amount: ${item.amount} × Price: $${item.price} = $${item.total}`, { indent: 20 });
            total += item.total;
        });

        // Итоговая сумма
        doc.moveDown();
        doc.fontSize(16).text(`Total: $${total.toFixed(2)}`, { align: 'right' });

        doc.end();
    });
}

// Основной endpoint для генерации инвойса
app.post('/generate-invoice', async (req, res) => {
    try {
        console.log('Generate invoice request:', req.body);
        const { invoiceData, chatId, payment_status } = req.body;
        
        if (payment_status !== 'paid') {
            return res.status(402).json({ success: false, error: 'Payment required' });
        }
        
        const pdfBuffer = await generatePDF(invoiceData);
        
        await bot.sendDocument(chatId, pdfBuffer, {
            filename: 'invoice.pdf',
            caption: 'Here is your generated invoice!'
        });

        res.json({ success: true, message: 'Invoice generated and sent successfully' });
    } catch (error) {
        console.error('Error generating invoice:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Проверка работоспособности сервера
app.get('/', (req, res) => {
    res.json({ status: 'Server is running' });
});

// Добавьте этот новый endpoint для создания инвойса
app.post('/create-invoice', async (req, res) => {
    try {
        const { chatId } = req.body;
        console.log('Creating invoice for chat ID:', chatId);
        
        const prices = [{
            label: 'Invoice Generation',
            amount: 100 // 1 звезда = 100
        }];
        
        // Создаем инвойс через sendInvoice
        const invoice = await bot.sendInvoice(
            chatId,
            'Generate Invoice PDF',
            'Generate a professional PDF invoice with your data',
            `invoice_${Date.now()}`,
            '', // пустой provider_token для цифровых товаров
            'XTR',
            prices,
            {
                need_name: false,
                need_phone_number: false,
                need_email: false,
                need_shipping_address: false,
                is_flexible: false,
                protect_content: true,
                photo_url: null,
                photo_size: null,
                photo_width: null,
                photo_height: null,
                provider_data: null,
                send_email_to_provider: false,
                send_phone_number_to_provider: false
            }
        );
        
        console.log('Invoice sent:', invoice);
        res.json({ success: true });
    } catch (error) {
        console.error('Error creating invoice:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});



// Добавим обработчик событий от Telegram
app.post('/webhook', express.json(), async (req, res) => {
    console.log('Webhook received:', req.body);
    
    try {
        const update = req.body;
        
        // Обработка pre_checkout_query
        if (update.pre_checkout_query) {
            console.log('Pre-checkout query received:', update.pre_checkout_query);
            await bot.answerPreCheckoutQuery(update.pre_checkout_query.id, true);
        }
        
        // Обработка successful_payment
        if (update.message && update.message.successful_payment) {
            console.log('Successful payment received:', update.message.successful_payment);
            // Здесь можно добавить дополнительную логику
        }
        
        res.json({ ok: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Обработчик вебхуков от Telegram
app.post(`/webhook/${process.env.TELEGRAM_BOT_TOKEN}`, async (req, res) => {
    try {
        console.log('Webhook received:', req.body);
        const { pre_checkout_query, message } = req.body;
        
        if (pre_checkout_query) {
            // Обработка pre_checkout_query
            console.log('Pre-checkout query received:', pre_checkout_query);
            await bot.answerPreCheckoutQuery(pre_checkout_query.id, true);
        }
        
        if (message && message.successful_payment) {
            // Обработка успешного платежа
            console.log('Payment successful:', message.successful_payment);
            // Здесь можно добавить дополнительную логику
        }
        
        res.sendStatus(200);
    } catch (error) {
        console.error('Webhook error:', error);
        res.sendStatus(500);
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});