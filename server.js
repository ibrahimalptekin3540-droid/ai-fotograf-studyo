const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// --- ARA KATMANLAR (MIDDLEWARE) ---
app.use(cors());
app.use(express.static('.')); // HTML, CSS ve JS dosyalarını sunar
const upload = multer({ dest: 'uploads/' }); // Yüklenen dosyalar için geçici klasör

// --- GOOGLE AI KURULUMU ---
const GEMINI_API_KEY = process.env.GEMINI_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// --- ANA API ENDPOINT'İ ---
app.post('/api/process', upload.single('image'), async (req, res) => {
    try {
        // 1. Girdi Kontrolü
        if (!req.file || !req.body.prompt) {
            return res.status(400).send("Hata: Dosya veya talimat (prompt) eksik.");
        }

        // 2. Model Tanımlama (Listenizdeki en güncel model)
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // 3. Görseli Yapay Zekanın Anlayacağı Formata (Base64) Çevirme
        const imagePart = {
            inlineData: {
                data: Buffer.from(fs.readFileSync(req.file.path)).toString("base64"),
                mimeType: req.file.mimetype
            }
        };

        const prompt = req.body.prompt;

        // 4. Gemini'ye Gönder ve Yanıt Bekle
        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const textResponse = response.text();

        console.log("Gemini Analizi Başarılı:", textResponse);

        // 5. Yanıtı Gönder (Test aşamasında olduğumuz için orijinal resmi geri yolluyoruz)
        // Bu, sunucu ile yapay zeka arasındaki bağın koptuğunu değil, kurulduğunu kanıtlar.
        res.sendFile(path.resolve(req.file.path), () => {
            // İşlem bittiğinde sunucu belleğini yormamak için geçici dosyayı siliyoruz
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path); 
            }
        });

    } catch (error) {
