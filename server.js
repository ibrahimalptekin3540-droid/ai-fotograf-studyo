const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fal = require("@fal-ai/serverless-client");
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(cors());

const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } 
});

fal.config({ credentials: process.env.FAL_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

app.post('/api/process', upload.single('image'), async (req, res) => {
    try {
        if (!req.file || !req.body.prompt) return res.status(400).send("Veri eksik.");

        const imageBase64 = req.file.buffer.toString("base64");
        const base64Image = `data:${req.file.mimetype};base64,${imageBase64}`;

        // 1. GEMINI ANALİZİ (Geliştirilmiş Çoklu Yüz Sadakati)
        const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
        const analysisPrompt = `Target Style: ${req.body.prompt}. 
        
        STRICT IDENTITY INSTRUCTIONS: 
        1. MULTI-FACE IDENTITY: Maintain the facial features, bone structure, and identity of EVERY person in the photo 99% identical. Do not alter eyes, nose, or mouth shapes. Each individual must be instantly recognizable as their original self.
        2. SKIN & RETOUCH: Apply professional skin smoothing and remove blemishes, but do NOT change the skin tone or facial shadows that define the person's identity. 
        3. STYLE APPLICATION: Apply the ${req.body.prompt} style only to the textures, clothing, and overall atmosphere without distorting facial geometry.
        4. BACKGROUND & LIGHTING: Use 8k realistic lighting and bokeh for backgrounds. Ensure the shadows on faces match the new background lighting while maintaining 99% similarity. 
        5. OUTLINE: Add a very thin, precise aesthetic outline around all subjects.

        Return ONLY the optimized prompt text.`;

        const visionResult = await geminiModel.generateContent([
            analysisPrompt, 
            { inlineData: { data: imageBase64, mimeType: req.file.mimetype } }
        ]);
        const finalPrompt = visionResult.response.text();

        // 2. FAL.AI ÇAĞRISI (Yüksek Sadakat Parametresi)
        const result = await fal.subscribe("fal-ai/qwen-image-edit", {
            input: {
                image_url: base64Image,
                prompt: finalPrompt,
                strength: 0.15 // Sadakati %99'a çekmek için 0.25'ten 0.15'e indirildi
            }
        });

        let editedImageUrl = result.image?.url || result.images?.[0]?.url;
        if (!editedImageUrl) throw new Error("Görsel URL'si bulunamadı.");

        const response = await fetch(editedImageUrl);
        if (!response.ok) throw new Error("Görsel indirilemedi.");
        const buffer = await response.buffer();

        res.set('Content-Type', 'image/png');
        res.send(buffer);

    } catch (error) {
        console.error("HATA:", error.message);
        res.status(500).send(`Sistem Hatası: ${error.message}`);
    }
});

app.listen(port, () => console.log(`Yüksek Sadakatli Stüdyo 3.1 Yayında!`));
