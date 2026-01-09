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

// API Anahtarları (Render'daki HF_TOKEN ve GEMINI_KEY isimleriyle uyumlu)
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

        // 1. GEMINI 2.5 FLASH ANALİZİ
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
        const imagePart = {
            inlineData: {
                data: Buffer.from(fs.readFileSync(imagePath)).toString("base64"),
                mimeType: req.file.mimetype
            }
        };

        const analysisPrompt = `Analyze this image and provide a highly detailed artistic prompt to transform it into ${selectedStyle} style. Maintain the original pose. Only return the prompt text.`;
        const visionResult = await model.generateContent([analysisPrompt, imagePart]);
        const finalPrompt = visionResult.response.text();
        console.log("Gemini Promptu Hazırladı:", finalPrompt);

        // 2. HUGGING FACE ROUTER (FLUX.1-schnell) - Ücretsiz ve Hızlı
        const hfModel = "black-forest-labs/FLUX.1-schnell"; 
        const hfURL = `https://router.huggingface.co/hf-inference/models/${hfModel}`;

        const hfResponse = await fetch(hfURL, {
            headers: { 
                Authorization: `Bearer ${HF_TOKEN}`, // Yeni Fine-grained Token
                "Content-Type": "application/json"
            },
            method: "POST",
            body: JSON.stringify({
                inputs: finalPrompt,
                parameters: {
                    num_inference_steps: 4, // Schnell modelleri için idealdir
                    guidance_scale: 0.0
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
