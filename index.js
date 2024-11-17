require('dotenv').config();
const express = require('express');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const port = process.env.PORT || 3000;

// Инициализация бота
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });

// Middleware
app.use(cors());
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
        
        // Информация о клиенте
        doc.moveDown();
        doc.fontSize(14)
           .text('Client Information', { underline: true })
           .text(`Name: ${invoiceData.clientName}`)
           .text(`Email: ${invoiceData.clientEmail || 'N/A'}`);

        // Информация о товарах
        doc.moveDown()
           .text('Items', { underline: true });
        
        invoiceData.items.forEach(item => {
            doc.text(`${item.description} - $${item.amount}`);
        });

        // Итоговая сумма
        doc.moveDown();
        const total = invoiceData.items.reduce((sum, item) => sum + parseFloat(item.amount), 0);
        doc.fontSize(16).text(`Total: $${total}`, { align: 'right' });

        doc.end();
    });
}

// Основной endpoint для генерации инвойса
app.post('/generate-invoice', async (req, res) => {
    try {
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