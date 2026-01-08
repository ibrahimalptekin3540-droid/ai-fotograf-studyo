const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;

// --- ARA KATMANLAR (MIDDLEWARE) ---
app.use(cors());
app.use(express.static('.')); 
const upload = multer({ dest: 'uploads/' });

// --- API ANAHTARLARI (Render Environment Variables) ---
const GEMINI_API_KEY = process.env.GEMINI_KEY;
const HF_TOKEN = process.env.HF_TOKEN;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// --- ANA API ENDPOINT'İ ---
app.post('/api/process', upload.single('image'), async (req, res) => {
    try {
        if (!req.file || !req.body.prompt) {
            return res.status(400).send("Dosya veya stil seçimi eksik.");
        }

        const selectedStyle = req.body.prompt;
        const imagePath = req.file.path;

        console.log(`İşlem başladı: Stil -> ${selectedStyle}`);

        // 1. GEMINI 2.5 FLASH İLE GÖRSEL ANALİZİ
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const imagePart = {
            inlineData: {
                data: Buffer.from(fs.readFileSync(imagePath)).toString("base64"),
                mimeType: req.file.mimetype
            }
        };

        const analysisPrompt = `Analyze this image and describe the person/subject. 
        Then, generate a highly detailed artistic prompt to transform them into ${selectedStyle} style. 
        Maintain facial features and pose. Only return the final prompt text.`;

        const visionResult = await model.generateContent([analysisPrompt, imagePart]);
        const finalPrompt = visionResult.response.text();
        console.log("Üretilen Sanat Komutu:", finalPrompt);

        // 2. HUGGING FACE ROUTER (SDXL) İLE GÖRSEL DÖNÜŞTÜRME
        // URL ADRESİ GÜNCELLENDİ: router.huggingface.co kullanılıyor
        const hfResponse = await fetch(
            "https://router.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
            {
                headers: { 
                    Authorization: `Bearer ${HF_TOKEN}`,
                    "Content-Type": "application/json"
                },
                method: "POST",
                body: JSON.stringify({
                    inputs: finalPrompt,
                    parameters: {
                        negative_prompt: "deformed, blurry, low quality, extra limbs, bad eyes",
                        num_inference_steps: 30,
                        guidance_scale: 8.0
                    }
                }),
            }
        );

        if (!hfResponse.ok) {
            const errorMsg = await hfResponse.text();
            throw new Error(`Hugging Face Router Hatası: ${errorMsg}`);
        }

        const buffer = await hfResponse.buffer();
        const outputPath = `uploads/edited_${Date.now()}.png`;
        fs.writeFileSync(outputPath, buffer);

        // 3. SONUCU GÖNDER VE TEMİZLİK YAP
        res.sendFile(path.resolve(outputPath), () => {
            if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        });

    } catch (error) {
        console.error("HATA:", error.message);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).send(`Sistem Hatası: ${error.message}`);
    }
});

if (!fs.existsSync('uploads')){ fs.mkdirSync('uploads'); }
app.listen(port, () => {
    console.log(`Sunucu yeni Hugging Face Router sistemiyle hazır!`);
});
