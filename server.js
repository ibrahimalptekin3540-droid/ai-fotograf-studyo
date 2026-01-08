const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.static('.')); // HTML, CSS, JS dosyalarını sunmak için
const upload = multer({ dest: 'uploads/' });

// API Anahtarı (Render üzerinden güvenli bir şekilde alınacak)
const GEMINI_API_KEY = process.env.GEMINI_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// --- ANA API ENDPOINT'İ ---
app.post('/api/process', upload.single('image'), async (req, res) => {
    try {
        if (!req.file || !req.body.prompt) {
            return res.status(400).send("Dosya veya talimat eksik.");
        }

        // En kararlı model ismi olan 'gemini-pro' kullanılıyor
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        // Görseli Base64 formatına çevir
        const imagePart = {
            inlineData: {
                data: Buffer.from(fs.readFileSync(req.file.path)).toString("base64"),
                mimeType: req.file.mimetype
            }
        };

        const prompt = req.body.prompt;

        // Gemini'den yanıt al
        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const textResponse = response.text();

        console.log("Gemini Yanıtı:", textResponse);

        // İşlem başarılı olduğunda orijinal dosyayı geri gönder (Test amaçlı)
        res.sendFile(path.resolve(req.file.path), () => {
            // İşlem bitince geçici dosyayı sunucudan sil
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path); 
            }
        });

    } catch (error) {
        // --- DETAYLI HATA ANALİZİ ---
        console.error("--- HATA DETAYI BAŞLANGICI ---");
        console.error("Mesaj:", error.message);
        console.error("Stack Trace:", error.stack);
        
        // Eğer varsa API yanıt detaylarını yazdır
        if (error.response) {
            console.error("API Durum Kodu:", error.response.status);
            console.error("API Yanıt Verisi:", JSON.stringify(error.response.data));
        }
        console.error("--- HATA DETAYI SONU ---");

        // Geçici dosyayı temizle
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        // Kullanıcıya detaylı hata mesajı gönder
        res.status(500).send(`Yapay zeka hatası: ${error.message}. Detaylar için Render loglarını kontrol edin.`);
    }
});

// Sunucuyu Başlat
if (!fs.existsSync('uploads')){ fs.mkdirSync('uploads'); }
app.listen(port, () => {
    console.log(`Sunucu ${port} portunda hazır!`);
});
