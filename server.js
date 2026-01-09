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

// API Anahtarları (Mevcut çalışan anahtarlarınız)
const GEMINI_API_KEY = process.env.GEMINI_KEY;
const HF_TOKEN = process.env.HF_TOKEN; 
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

app.post('/api/process', upload.single('image'), async (req, res) => {
    try {
        if (!req.file || !req.body.prompt) {
            return res.status(400).send("Dosya veya stil seçimi eksik.");
        }

        const selectedStyle = req.body.prompt;
        const imagePath = req.file.path;
        const imageBuffer = fs.readFileSync(imagePath); // Görseli okuyoruz

        // 1. GEMINI 2.5 FLASH ANALİZİ
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
        const imagePart = {
            inlineData: {
                data: imageBuffer.toString("base64"),
                mimeType: req.file.mimetype
            }
        };

        // Gemini'ye sadece stili tarif etmesini söylüyoruz, sahneyi değil.
        const analysisPrompt = `Analyze this photo. Create a highly detailed prompt to transform this exact scene into ${selectedStyle} style. 
        Focus on describing the lighting, textures, and atmosphere of the ${selectedStyle}.
        Do not describe the people or composition, as we will use the original image as the base.
        Only return the prompt text.`;
        
        const visionResult = await model.generateContent([analysisPrompt, imagePart]);
        const finalPrompt = visionResult.response.text();
        console.log("Gemini Stil Komutunu Hazırladı:", finalPrompt);

        // 2. HUGGING FACE IMAGE-TO-IMAGE (SDXL) - Gerçek Dönüşüm
        const hfModel = "stabilityai/stable-diffusion-xl-base-1.0"; 
        const hfURL = `https://router.huggingface.co/hf-inference/models/${hfModel}`;

        const hfResponse = await fetch(hfURL, {
            headers: { 
                Authorization: `Bearer ${HF_TOKEN}`, // Çalışan Fine-grained Token
                "Content-Type": "application/json"
            },
            method: "POST",
            body: JSON.stringify({
                // ÖNEMLİ DEĞİŞİKLİK: Hem görseli hem komutu gönderiyoruz
                inputs: {
                    image: imageBuffer.toString("base64"), // Orijinal fotoğrafın kendisi
                    prompt: finalPrompt // Gemini'den gelen stil komutu
                },
                parameters: {
                    negative_prompt: "deformed, blurry, ugly, distorted faces, extra limbs, bad anatomy",
                    // STRENGTH: Orijinal fotoğrafa ne kadar sadık kalınacağı (0.0 - 1.0)
                    // 0.30 = Fotoğrafın %70'ini koru, %30'una stil uygula. Bu, "alakasız" sonucu önler.
                    strength: 0.30, 
                    guidance_scale: 7.5,
                    num_inference_steps: 25 // Daha kaliteli sonuç için adım sayısı
                }
            }),
        });

        if (!hfResponse.ok) {
            const errorMsg = await hfResponse.text();
            throw new Error(`HF Router Hatası (${hfResponse.status}): ${errorMsg}`);
        }

        const buffer = await hfResponse.buffer();
        const outputPath = `uploads/edited_${Date.now()}.png`;
        fs.writeFileSync(outputPath, buffer);

        // 3. SONUCU GÖNDER VE TEMİZLE
        res.sendFile(path.resolve(outputPath), () => {
            if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        });

    } catch (error) {
        console.error("KRİTİK HATA:", error.message);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).send(`İşlem Başarısız: ${error.message}`);
    }
});

if (!fs.existsSync('uploads')){ fs.mkdirSync('uploads'); }
app.listen(port, () => console.log(`Sunucu aktif!`));
