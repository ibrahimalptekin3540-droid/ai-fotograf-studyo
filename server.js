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

        // 1. GEMINI ANALİZİ (Ultra-Gerçekçi & Doğal Doku Odaklı)
        const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
        const analysisPrompt = `Target Style: ${req.body.prompt}. 
        
        STRICT REALISM & IDENTITY INSTRUCTIONS: 
        1. PHOTOREALISTIC IDENTITY: Maintain the facial geometry and features of EVERY person 99% identical. Use "hyper-realistic skin textures" and "natural skin pores" to avoid a plastic look.
        2. NATURAL RETOUCH: Remove blemishes and marks BUT preserve natural skin folds, subtle expressions, and fine lines that define the person's character. Ensure "subsurface scattering" on skin for realistic lighting.
        3. LIGHTING MASTER: Match the original face shadows with the new environment using "global illumination" and "ray-traced lighting." Every person must appear integrated into the 3D space with correct "ambient occlusion."
        4. IMAGE QUALITY: Output must feel like a "raw 8k photograph" taken with a high-end prime lens. Focus on "sharp focus on eyes" and "natural depth of field." 
        5. STYLE BLENDING: Incorporate ${req.body.prompt} elements subtly into the surroundings while keeping the subjects in ultra-high fidelity.

        Return ONLY the optimized, technical prompt text.`;

        const visionResult = await geminiModel.generateContent([
            analysisPrompt, 
            { inlineData: { data: imageBase64, mimeType: req.file.mimetype } }
        ]);
        const finalPrompt = visionResult.response.text();

        // 2. FAL.AI ÇAĞRISI (Ücretli Katman Avantajıyla En Yüksek Kalite)
        const result = await fal.subscribe("fal-ai/qwen-image-edit", {
            input: {
                image_url: base64Image,
                prompt: finalPrompt,
                strength: 0.18, // Gerçekçilik ve stil dengesi için 0.15'ten 0.18'e çok hafif yükseltildi
                guidance_scale: 7.5, // Prompt'a daha sadık kalması için standart değerde tutuldu
                num_inference_steps: 50 // Daha fazla detay işlemesi için (Ücretli katman avantajı)
            }
        });

        let editedImageUrl = result.image?.url || result.images?.[0]?.url;
        if (!editedImageUrl) throw new Error("Görsel URL'si bulunamadı.");

        const response = await fetch(editedImageUrl);
        const buffer = await response.buffer();

        res.set('Content-Type', 'image/png');
        res.send(buffer);

    } catch (error) {
        console.error("HATA:", error.message);
        res.status(500).send(`Sistem Hatası: ${error.message}`);
    }
});

app.listen(port, () => console.log(`Ultra-Gerçekçi Stüdyo 4.0 Yayında!`));
