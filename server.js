const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fal = require("@fal-ai/serverless-client");
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;
app.use(cors());
app.use(express.static('.')); 
const upload = multer({ dest: 'uploads/' });

// API YAPILANDIRMASI
fal.config({ credentials: process.env.FAL_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

app.post('/api/process', upload.single('image'), async (req, res) => {
    try {
        if (!req.file || !req.body.prompt) return res.status(400).send("Dosya eksik.");

        const imageBuffer = fs.readFileSync(req.file.path);
        const base64Image = `data:${req.file.mimetype};base64,${imageBuffer.toString("base64")}`;

        // 1. GEMINI ANALİZİ (%99 Yüz Sadakati)
        const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
        const analysisPrompt = `Target Style: ${req.body.prompt}. Command: Maintain identity 99% identical. Return only prompt text.`;
        const visionResult = await geminiModel.generateContent([
            analysisPrompt, 
            { inlineData: { data: imageBuffer.toString("base64"), mimeType: req.file.mimetype } }
        ]);
        const finalPrompt = visionResult.response.text();

        // 2. FAL.AI ÇAĞRISI
        console.log("Fal.ai işliyor...");
        const result = await fal.subscribe("fal-ai/qwen-image-edit", {
            input: {
                image_url: base64Image,
                prompt: finalPrompt,
                strength: 0.25
            }
        });

        // 3. KRİTİK DÜZELTME: URL'yi her iki formatta da ara
        let editedImageUrl = null;
        if (result.image && result.image.url) {
            editedImageUrl = result.image.url;
        } else if (result.images && result.images[0] && result.images[0].url) {
            editedImageUrl = result.images[0].url;
        }

        if (!editedImageUrl) {
            console.error("API Yanıtı Beklenmedik:", result);
            throw new Error("Görsel URL'si bulunamadı.");
        }

        // 4. GÖRSELİ İNDİR VE GÖNDER
        const response = await fetch(editedImageUrl);
        const buffer = await response.buffer();
        const outputPath = `uploads/res_${Date.now()}.png`;
        fs.writeFileSync(outputPath, buffer);

        res.sendFile(path.resolve(outputPath), () => {
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        });

    } catch (error) {
        console.error("HATA DETAYI:", error.message);
        res.status(500).send(`Sistem Hatası: ${error.message}`);
    }
});

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
app.listen(port, () => console.log(`Profesyonel Stüdyo Yayında!`));
