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

        // 1. STİL VE MODEL EŞLEŞTİRME (En Güncel Sürümlerle Revize Edildi)
        let hfModel = "Qwen/Qwen-Image-Edit-2511"; // Varsayılan En Sağlam Model
        let modelType = "qwen";

        if (selectedStyle.includes("anime") || selectedStyle.includes("ghibli")) {
            hfModel = "autoweeb/Qwen-Image-Edit-2509-Photo-to-Anime";
        } else if (selectedStyle.includes("lego") || selectedStyle.includes("cyberpunk") || selectedStyle.includes("pixar")) {
            hfModel = "black-forest-labs/FLUX.1-schnell"; // Uptime oranı en yüksek model
            modelType = "flux";
        } else if (selectedStyle.includes("tamir") || selectedStyle.includes("restore")) {
            hfModel = "prithivMLmods/Photo-Restore-i2i";
        }

        // 2. GEMINI ANALİZİ (%99 Yüz Sadakati Talimatı)
        const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
        const analysisPrompt = `Target Style: ${selectedStyle}. 
        Analyze the people. Create an instruction for ${hfModel} to apply ${selectedStyle} style. 
        CRITICAL: Command the AI to keep the people's faces, features, and identities 100% IDENTICAL. 
        Only change lighting and background. Return only instruction text.`;
        
        const visionResult = await geminiModel.generateContent([analysisPrompt, {
            inlineData: { data: base64Image, mimeType: req.file.mimetype }
        }]);
        const finalPrompt = visionResult.response.text();

        // 3. GELİŞMİŞ HUGGING FACE ÇAĞRI SİSTEMİ (Anti-410 Mantığı)
        async function callHF(model, type, prompt, imgBase64) {
            const url = `https://api-inference.huggingface.co/models/${model}`;
            const payload = (type === "qwen") 
                ? { inputs: prompt, image: imgBase64 } 
                : { inputs: imgBase64, parameters: { prompt: prompt, strength: 0.25 } };

            return await fetch(url, {
                headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
                method: "POST",
                body: JSON.stringify(payload),
            });
        }

        // İlk Deneme: Tercih edilen model
        let hfResponse = await callHF(hfModel, modelType, finalPrompt, base64Image);

        // FALLBACK: Eğer model 410, 404 veya 500 verirse Yedek Modele Geç
        if (!hfResponse.ok) {
            console.warn(`${hfModel} hata (${hfResponse.status}) verdi. Yedek modele saptanıyor...`);
            // Yedek 1: Resmî Qwen Image Edit (En Kararlı)
            hfResponse = await callHF("Qwen/Qwen-Image-Edit-2511", "qwen", finalPrompt, base64Image);
            
            if (!hfResponse.ok) {
                // Yedek 2: Stable Diffusion XL (Görselden Görsele)
                hfResponse = await callHF("stabilityai/stable-diffusion-xl-base-1.0", "flux", finalPrompt, base64Image);
            }
        }

        if (!hfResponse.ok) throw new Error(`Tüm modeller yanıt vermiyor (Durum: ${hfResponse.status})`);

        const buffer = await hfResponse.buffer();
        const outputPath = `uploads/edited_${Date.now()}.png`;
        fs.writeFileSync(outputPath, buffer);

        // 4. SONUCU GÖNDER VE TEMİZLE
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
app.listen(port, () => console.log(`Sunucu aktif: Port ${port}`));
