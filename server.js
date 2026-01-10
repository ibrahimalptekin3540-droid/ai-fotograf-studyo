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

const GEMINI_API_KEY = process.env.GEMINI_KEY;
const HF_TOKEN = process.env.HF_TOKEN; 
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

app.post('/api/process', upload.single('image'), async (req, res) => {
    try {
        if (!req.file || !req.body.prompt) {
            return res.status(400).send("Dosya veya stil seçimi eksik.");
        }

        const selectedStyle = req.body.prompt.toLowerCase();
        const imagePath = req.file.path;
        const imageBuffer = fs.readFileSync(imagePath);
        const base64Image = imageBuffer.toString("base64");

        // 1. AKILLI MODEL SEÇİCİ (Router)
        let hfModel = "Qwen/Qwen-Image-Edit-2511"; // Varsayılan genel model

        if (selectedStyle.includes("anime") || selectedStyle.includes("ghibli")) {
            hfModel = "autoweeb/Qwen-Image-Edit-2509-Photo-to-Anime";
        } else if (selectedStyle.includes("lego") || selectedStyle.includes("cyberpunk") || selectedStyle.includes("steampunk") || selectedStyle.includes("arka plan")) {
            hfModel = "black-forest-labs/FLUX.1-Kontext-dev";
        } else if (selectedStyle.includes("chibi") || selectedStyle.includes("pixar") || selectedStyle.includes("kukla")) {
            hfModel = "rsshekhawat/Qwen-Edit-3DChibi-LoRA";
        } else if (selectedStyle.includes("karakalem") || selectedStyle.includes("eskiz")) {
            hfModel = "tlennon-ie/qwen-edit-skin";
        } else if (selectedStyle.includes("gece") || selectedStyle.includes("relight")) {
            hfModel = "dx8152/Qwen-Image-Edit-2509-Relight";
        } else if (selectedStyle.includes("tamir") || selectedStyle.includes("restore")) {
            hfModel = "prithivMLmods/Photo-Restore-i2i";
        }

        // 2. GEMINI 2.5 FLASH ANALİZİ (Model Odaklı Komut)
        const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
        const analysisPrompt = `Target Style: ${selectedStyle}. 
        Action: Create a technical editing instruction for the model ${hfModel}. 
        CRITICAL: Command the AI to keep the people's faces, features, and expressions 99% identical to the original image. 
        Only modify the environment, textures, and lighting to match the ${selectedStyle} aesthetic. 
        Only return the prompt text.`;
        
        const visionResult = await geminiModel.generateContent([analysisPrompt, {
            inlineData: { data: base64Image, mimeType: req.file.mimetype }
        }]);
        const finalPrompt = visionResult.response.text();
        console.log(`Seçilen Model: ${hfModel} | Komut: ${finalPrompt}`);

        // 3. HUGGING FACE ROUTER ÇAĞRISI
        const hfURL = `https://router.huggingface.co/hf-inference/models/${hfModel}`;
        const hfResponse = await fetch(hfURL, {
            headers: { 
                Authorization: `Bearer ${HF_TOKEN}`, 
                "Content-Type": "application/json"
            },
            method: "POST",
            body: JSON.stringify({
                inputs: {
                    image: base64Image,
                    prompt: finalPrompt
                },
                parameters: {
                    negative_prompt: "deformed face, different people, blurry, changed identity",
                    strength: 0.35, // Yüz sadakati için ideal denge
                    guidance_scale: 12.0
                }
            }),
        });

        if (!hfResponse.ok) {
            const errorMsg = await hfResponse.text();
            throw new Error(`Model Hatası (${hfResponse.status}): ${errorMsg}`);
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
app.listen(port, () => console.log(`20 Stilli Sanat Stüdyosu Aktif!`));
