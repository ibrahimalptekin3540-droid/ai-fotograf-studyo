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
        if (!req.file || !req.body.prompt) return res.status(400).send("Veri eksik.");

        const selectedStyle = req.body.prompt;
        const imagePath = req.file.path;
        const imageBuffer = fs.readFileSync(imagePath);
        const base64Image = `data:${req.file.mimetype};base64,${imageBuffer.toString("base64")}`;

        // 1. GEMINI ANALİZİ (%99 Yüz Sadakati + İnce Kenar Çizgisi Talimatı)
        const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
        const analysisPrompt = `Analysis: ${selectedStyle}. 
        CRITICAL: Maintain the person's identity and facial features 99% identical. 
        INSTRUCTION: Add a very thin, aesthetic outline around subjects for easy cutting. 
        Return ONLY the optimized prompt text.`;
        
        const visionResult = await geminiModel.generateContent([
            analysisPrompt, 
            { inlineData: { data: imageBuffer.toString("base64"), mimeType: req.file.mimetype } }
        ]);
        const finalPrompt = visionResult.response.text();

        // 2. FAL.AI ÇAĞRISI (Qwen-Image-Edit Uzmanlığı)
        const result = await fal.subscribe("fal-ai/qwen-image-edit", {
            input: {
                image_url: base64Image,
                prompt: finalPrompt,
                strength: 0.25 // Sadakat için kritik değer
            }
        });

        // 3. SONUCU ALMA VE İSTEMCİYE GÖNDERME
        const response = await fetch(result.image.url);
        const buffer = await response.buffer();
        const outputPath = `uploads/final_${Date.now()}.png`;
        fs.writeFileSync(outputPath, buffer);

        res.sendFile(path.resolve(outputPath), () => {
            if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        });

    } catch (error) {
        console.error("FAL API HATASI:", error.message);
        res.status(500).send(`İşlem Başarısız: ${error.message}`);
    }
});

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
app.listen(port, () => console.log(`Fal.ai Destekli Stüdyo 1.1 Yayında!`));
