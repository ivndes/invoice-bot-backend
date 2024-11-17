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
        console.log('Получен запрос:', req.body); // Для отладки
        const { invoiceData, chatId } = req.body;
        
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

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});