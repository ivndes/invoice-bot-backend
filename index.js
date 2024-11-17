require('dotenv').config();
const express = require('express');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const port = process.env.PORT || 3000;

// Инициализация бота
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });

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
        console.log('Получен запрос:', req.body);
        const { invoiceData, chatId, payment_status } = req.body;
        
        // Проверяем статус оплаты
        if (payment_status !== 'paid') {
            return res.status(402).json({ success: false, error: 'Payment required' });
        }
        
        // Генерируем PDF
        const pdfBuffer = await generatePDF(invoiceData);

        // Отправляем через телеграм
        await bot.sendDocument(chatId, pdfBuffer, {
            filename: 'invoice.pdf',
            caption: 'Here is your generated invoice!'
        });

        res.json({ success: true, message: 'Invoice generated and sent successfully' });
    } catch (error) {
        console.error('Error:', error);
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
        const invoiceLink = await bot.createInvoiceLink(
            'Generate Invoice PDF',
            'Generate a professional PDF invoice with your data',
            `invoice_${Date.now()}`,
            '', // provider_token пустой для цифровых товаров
            'XTR',
            [{
                label: 'Invoice Generation',
                amount: 1
            }],
            {
                max_tip_amount: 0,
                suggested_tip_amounts: [],
                need_name: false,
                need_phone_number: false,
                need_email: false,
                need_shipping_address: false,
                send_phone_number_to_provider: false,
                send_email_to_provider: false,
                is_flexible: false,
                protect_content: true
            }
        );

        res.json({ success: true, invoice_url: invoiceLink });
    } catch (error) {
        console.error('Detailed error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Обработчик pre-checkout запроса
app.post('/pre-checkout', async (req, res) => {
    try {
        const { preCheckoutQueryId } = req.body;
        await bot.answerPreCheckoutQuery(preCheckoutQueryId, true);
        res.json({ success: true });
    } catch (error) {
        console.error('Error in pre-checkout:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});