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

        const analysisPrompt = `Analyze this image and its subject. Generate a creative, descriptive prompt to transform it into ${selectedStyle} style. Focus on artistic details and mood. Only return the prompt text.`;
        const visionResult = await model.generateContent([analysisPrompt, imagePart]);
        const finalPrompt = visionResult.response.text();

        // 2. HUGGING FACE ROUTER (En Kararlı Model: SD v1.5)
        // 'Not Found' hatasını aşmak için en yaygın kullanılan modele geçiyoruz
        const hfModel = "runwayml/stable-diffusion-v1-5"; 
        
        const hfResponse = await fetch(
            `https://router.huggingface.co/models/${hfModel}`,
            {
                headers: { 
                    Authorization: `Bearer ${HF_TOKEN}`,
                    "Content-Type": "application/json"
                },
                method: "POST",
                body: JSON.stringify({
                    inputs: finalPrompt,
                    parameters: {
                        negative_prompt: "deformed, blurry, low quality, bad anatomy, text, watermark",
                        num_inference_steps: 40,
                        guidance_scale: 7.5
                    }
                }),
            }
        );

        if (!hfResponse.ok) {
            const errorMsg = await hfResponse.text();
            // Eğer model hala yükleniyorsa 503 hatası verebilir, bu normaldir
            throw new Error(`HF Yanıtı: ${hfResponse.status} - ${errorMsg}`);
        }

        const buffer = await hfResponse.buffer();
        const outputPath = `uploads/edited_${Date.now()}.png`;
        fs.writeFileSync(outputPath, buffer);

        res.sendFile(path.resolve(outputPath), () => {
            if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        });

    } catch (error) {
        console.error("SİSTEM HATASI:", error.message);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).send(`Hata: ${error.message}`);
    }
});

if (!fs.existsSync('uploads')){ fs.mkdirSync('uploads'); }
app.listen(port, () => console.log(`Sunucu SD v1.5 ve Router ile aktif!`));
