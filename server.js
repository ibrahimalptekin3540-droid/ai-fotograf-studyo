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

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

        // Görseli Base64 formatına çevir
        const imagePart = {
            inlineData: {
                data: Buffer.from(fs.readFileSync(req.file.path)).toString("base64"),
                mimeType: req.file.mimetype
            }
        };

        const prompt = req.body.prompt;

        // Gemini'den yanıt al (Analiz ve Düzenleme Talimatı)
        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const textResponse = response.text();

        console.log("Gemini Yanıtı:", textResponse);

        /* ÖNEMLİ NOT: Gemini API şu an için doğrudan düzenlenmiş resim dosyası 
           döndürmez. Profesyonel düzenleme için bu aşamada Imagen API veya 
           Hugging Face modelleri tetiklenir. 
           Şu an uygulamanızın çalıştığını görmeniz için orijinal dosyayı geri gönderiyoruz.
        */
        
        res.sendFile(path.resolve(req.file.path), () => {
            // İşlem bitince geçici dosyayı sunucudan sil
            fs.unlinkSync(req.file.path); 
        });

    } catch (error) {
        console.error("Hata:", error);
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(500).send("Yapay zeka işlemi sırasında bir hata oluştu.");
    }
});

// Sunucuyu Başlat
if (!fs.existsSync('uploads')){ fs.mkdirSync('uploads'); }
app.listen(port, () => {
    console.log(`Sunucu ${port} portunda hazır!`);
});
