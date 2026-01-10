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
        if (!req.file || !req.body.prompt) return res.status(400).send("Veri eksik.");

        const selectedStyle = req.body.prompt.toLowerCase();
        const imagePath = req.file.path;
        const base64Image = fs.readFileSync(imagePath).toString("base64");

        // 1. GEMINI ANALİZİ (%99 Yüz Sadakati)
        const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
        const analysisPrompt = `Target Style: ${selectedStyle}. 
        Constraint: Keep people's identity 99% identical. Only change environment and texture. 
        Only return the prompt text.`;
        
        const visionResult = await geminiModel.generateContent([analysisPrompt, {
            inlineData: { data: base64Image, mimeType: req.file.mimetype }
        }]);
        const finalPrompt = visionResult.response.text();

        // 2. ÇOK KADEMELİ MODEL DENEME LİSTESİ
        // Birinci model hata verirse sıradakine geçer.
        let tryList = [];

        if (selectedStyle.includes("anime") || selectedStyle.includes("ghibli")) {
            tryList = [
                { model: "autoweeb/Qwen-Image-Edit-2509-Photo-to-Anime", provider: "fal-ai" },
                { model: "Qwen/Qwen-Image-Edit", provider: "hf-inference" }
            ];
        } else if (selectedStyle.includes("lego") || selectedStyle.includes("cyber") || selectedStyle.includes("pixar")) {
            tryList = [
                { model: "black-forest-labs/FLUX.1-schnell", provider: "fal-ai" },
                { model: "stabilityai/stable-diffusion-xl-base-1.0", provider: "replicate" }
            ];
        } else {
            // Varsayılan Akış: Önce en güncel, sonra en kararlı ana model
            tryList = [
                { model: "Qwen/Qwen-Image-Edit-2511", provider: "fal-ai" },
                { model: "Qwen/Qwen-Image-Edit", provider: "hf-inference" }
            ];
        }

        // 3. AKILLI FETCH DÖNGÜSÜ (410 ve Meşgul Hatası Çözümü)
        let finalResponse = null;
        for (const attempt of tryList) {
            console.log(`Deneniyor: ${attempt.model} (${attempt.provider})`);
            
            const payload = {
                inputs: base64Image,
                provider: attempt.provider,
                parameters: { prompt: finalPrompt, strength: 0.25 }
            };

            const response = await fetch(`https://api-inference.huggingface.co/models/${attempt.model}`, {
                headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
                method: "POST",
                body: JSON.stringify(payload),
            });

            if (response.ok) {
                finalResponse = response;
                break; // Başarılıysa döngüden çık
            } else {
                console.warn(`${attempt.model} hata verdi (${response.status}). Sırada...`);
            }
        }

        if (!finalResponse) throw new Error("Üzgünüz, tüm yapay zeka kanalları şu an çok yoğun veya servis dışı.");

        const buffer = await finalResponse.buffer();
        const outputPath = `uploads/edited_${Date.now()}.png`;
        fs.writeFileSync(outputPath, buffer);

        res.sendFile(path.resolve(outputPath), () => {
            if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        });

    } catch (error) {
        console.error("KRİTİK HATA:", error.message);
        res.status(500).send(`İşlem Başarısız: ${error.message}`);
    }
});

if (!fs.existsSync('uploads')){ fs.mkdirSync('uploads'); }
app.listen(port, () => console.log(`Hatasız 20 Stil Sunucusu Aktif!`));
