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
        const imageBuffer = fs.readFileSync(imagePath);

        // 1. GEMINI ANALİZİ (Görseli Anlatma)
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
        const imagePart = {
            inlineData: {
                data: imageBuffer.toString("base64"),
                mimeType: req.file.mimetype
            }
        };

        const analysisPrompt = `Analyze this photo. Describe the environment and style elements needed to turn it into ${selectedStyle}. 
        CRITICAL: Do not describe the faces deeply, as we will use the original pixels for 99% similarity. 
        Focus only on the ${selectedStyle} aesthetic. Only return the prompt text.`;
        
        const visionResult = await model.generateContent([analysisPrompt, imagePart]);
        const finalPrompt = visionResult.response.text();

        // 2. HUGGING FACE IMAGE-TO-IMAGE CALL (SDXL)
        // SDXL, orijinal görseli baz alarak üzerine stil ekleme konusunda en başarılı ücretsiz modeldir.
        const hfModel = "stabilityai/stable-diffusion-xl-base-1.0"; 
        const hfURL = `https://router.huggingface.co/hf-inference/models/${hfModel}`;

        const hfResponse = await fetch(hfURL, {
            headers: { 
                Authorization: `Bearer ${HF_TOKEN}`, 
                "Content-Type": "application/json"
            },
            method: "POST",
            body: JSON.stringify({
                // Image-to-Image için görseli base64 olarak gönderiyoruz
                inputs: imageBuffer.toString("base64"), 
                parameters: {
                    prompt: finalPrompt,
                    negative_prompt: "deformed, blurry, changed faces, different people",
                    // STRENGTH: %99 benzerlik için bu değeri çok düşük (0.1 - 0.25) tutuyoruz
                    // 0.20 değeri; orijinal piksellerin %80'ini korur, %20 yeni stil ekler.
                    strength: 0.20, 
                    guidance_scale: 12.0
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
        console.error("HATA:", error.message);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).send(`Sistem Hatası: ${error.message}`);
    }
});

if (!fs.existsSync('uploads')){ fs.mkdirSync('uploads'); }
app.listen(port, () => console.log(`Sunucu aktif!`));
