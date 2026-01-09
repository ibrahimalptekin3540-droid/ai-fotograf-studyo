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

// API Anahtarları
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

        // 1. GEMINI 2.5 FLASH ANALİZİ (Daha Sıkı Komut)
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
        const imageBuffer = fs.readFileSync(imagePath);
        const imagePart = {
            inlineData: {
                data: imageBuffer.toString("base64"),
                mimeType: req.file.mimetype
            }
        };

        // GÜNCELLEME 1: Prompt orijinal yüzleri ve sahneyi korumaya odaklandı
        const analysisPrompt = `Analyze this image. Generate a detailed artistic prompt to transform the ENTIRE SCENE and ALL PEOPLE into ${selectedStyle} style. 
        CRITICAL: You MUST maintain the original facial features, expressions, poses, and the number of people (man and woman) from the photo. 
        Only return the prompt text.`;

        const visionResult = await model.generateContent([analysisPrompt, imagePart]);
        const finalPrompt = visionResult.response.text();
        console.log("Gemini Promptu Hazırladı:", finalPrompt);

        // 2. HUGGING FACE ROUTER (FLUX.1-schnell)
        const hfModel = "black-forest-labs/FLUX.1-schnell"; 
        const hfURL = `https://router.huggingface.co/hf-inference/models/${hfModel}`;

        const hfResponse = await fetch(hfURL, {
            headers: { 
                Authorization: `Bearer ${HF_TOKEN}`, // Fine-grained Token
                "Content-Type": "application/json"
            },
            method: "POST",
            body: JSON.stringify({
                inputs: finalPrompt,
                parameters: {
                    num_inference_steps: 6, // Kaliteyi artırmak için adımı biraz yükselttik
                    guidance_scale: 8.5, // Prompt'a daha sadık kalması için artırdık
                    // GÜNCELLEME 2: Orijinal fotoğrafa sadakat ayarı (0.1 = çok sadık, 1.0 = çok özgür)
                    // 0.6 değeri, yüzleri korurken stili uygulamak için ideal bir dengedir.
                    image_strength: 0.6 
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
