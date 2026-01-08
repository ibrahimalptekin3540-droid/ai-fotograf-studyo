const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('.'));
const upload = multer({ dest: 'uploads/' });

// API Anahtarları (Render Environment Variables kısmından gelir)
const GEMINI_API_KEY = process.env.GEMINI_KEY;
const HF_TOKEN = process.env.HF_TOKEN;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// --- ANA API ENDPOINT'İ ---
app.post('/api/process', upload.single('image'), async (req, res) => {
    try {
        if (!req.file || !req.body.prompt) {
            return res.status(400).send("Dosya veya talimat eksik.");
        }

        const userPrompt = req.body.prompt;
        const imagePath = req.file.path;

        console.log("İşlem başlıyor: ", userPrompt);

        // 1. GEMINI ANALİZİ (İsteğe bağlı: Görseli analiz edip prompt'u zenginleştirebilir)
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const imagePart = {
            inlineData: {
                data: Buffer.from(fs.readFileSync(imagePath)).toString("base64"),
                mimeType: req.file.mimetype
            }
        };
        
        // Gemini'den görsel hakkında kısa bir teknik bilgi alıyoruz (Arka planda çalışır)
        const visionResult = await model.generateContent(["Describe this image briefly for a style transfer.", imagePart]);
        const imageDescription = visionResult.response.text();
        console.log("Gemini Görsel Analizi:", imageDescription);

        // 2. HUGGING FACE ILE GÖRSEL DÖNÜŞTÜRME
        // Hazırlanan nihai prompt
        const finalPrompt = `${userPrompt}, ${imageDescription}, high quality, detailed, masterpiece`;

        const hfResponse = await fetch(
            "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-refiner-1.0",
            {
                headers: { 
                    Authorization: `Bearer ${HF_TOKEN}`,
                    "Content-Type": "application/json"
                },
                method: "POST",
                body: JSON.stringify({ 
                    inputs: finalPrompt,
                    // Opsiyonel: Buraya orijinal görseli referans olarak eklemek için Image-to-Image modelleri de kullanılabilir
                }),
            }
        );

        if (!hfResponse.ok) {
            const errorData = await hfResponse.text();
            throw new Error(`Hugging Face Hatası: ${errorData}`);
        }

        const buffer = await hfResponse.buffer();
        const outputPath = `uploads/edited_${Date.now()}.png`;
        
        fs.writeFileSync(outputPath, buffer);

        // 3. DÜZENLENMİŞ DOSYAYI GÖNDER
        res.sendFile(path.resolve(outputPath), () => {
            // Sunucuda yer kaplamaması için dosyaları temizle
            if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        });

    } catch (error) {
        console.error("Hata Detayı:", error.message);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).send("İşlem başarısız: " + error.message);
    }
});

if (!fs.existsSync('uploads')){ fs.mkdirSync('uploads'); }
app.listen(port, () => console.log(`Sunucu ${port} portunda hazır!`));
