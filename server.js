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

fal.config({ credentials: process.env.FAL_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

app.post('/api/process', upload.single('image'), async (req, res) => {
    try {
        if (!req.file || !req.body.prompt) return res.status(400).send("Veri eksik.");

        const imageBuffer = fs.readFileSync(req.file.path);
        const base64Image = `data:${req.file.mimetype};base64,${imageBuffer.toString("base64")}`;

        // 1. GEMINI ANALİZİ (Geliştirilmiş Stil Özelleştirme)
        const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
        const analysisPrompt = `Target Style: ${req.body.prompt}. 
        INSTRUCTIONS: 
        1. Maintain identity 99% identical. 
        2. Use extreme stylistic features unique to ${req.body.prompt} (lighting, brush strokes, textures). 
        3. Add a thin aesthetic outline around subjects. 
        4. If background location is provided, replace background seamlessly.
        Return ONLY the optimized prompt text.`;

        const visionResult = await geminiModel.generateContent([
            analysisPrompt, 
            { inlineData: { data: imageBuffer.toString("base64"), mimeType: req.file.mimetype } }
        ]);
        const finalPrompt = visionResult.response.text();

        // 2. FAL.AI ÇAĞRISI
        const result = await fal.subscribe("fal-ai/qwen-image-edit", {
            input: {
                image_url: base64Image,
                prompt: finalPrompt,
                strength: 0.25 // Sadakat için düşük tutuldu
            }
        });

        let editedImageUrl = result.image?.url || result.images?.[0]?.url;
        if (!editedImageUrl) throw new Error("Görsel URL'si bulunamadı.");

        const response = await fetch(editedImageUrl);
        const buffer = await response.buffer();
        const outputPath = `uploads/res_${Date.now()}.png`;
        fs.writeFileSync(outputPath, buffer);

        res.sendFile(path.resolve(outputPath), () => {
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        });

    } catch (error) {
        console.error("HATA:", error.message);
        res.status(500).send(`Sistem Hatası: ${error.message}`);
    }
});

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
app.listen(port, () => console.log(`Stüdyo 2.0 - 24 Stil Yayında!`));
