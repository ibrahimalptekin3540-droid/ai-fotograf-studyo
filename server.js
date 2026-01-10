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

        // 1. GÜNCEL VE AKTİF MODEL HAVUZU (410 Hatasını Önlemek İçin En Yeni Sürümler)
        // Not: Modellerin en güncel 'warm' sürümleri seçildi.
        let hfModel = "Qwen/Qwen2.5-VL-7B-Instruct"; // Genel ve en güçlü ana model
        let modelType = "qwen";

        if (selectedStyle.includes("anime") || selectedStyle.includes("ghibli")) {
            hfModel = "autoweeb/Qwen-Image-Edit-2509-Photo-to-Anime";
        } else if (selectedStyle.includes("lego") || selectedStyle.includes("cyberpunk") || selectedStyle.includes("pixar")) {
            hfModel = "black-forest-labs/FLUX.1-schnell"; // FLUX her zaman stabildir.
            modelType = "flux";
        } else if (selectedStyle.includes("karakalem") || selectedStyle.includes("eskiz")) {
            hfModel = "tlennon-ie/qwen-edit-skin";
        } else if (selectedStyle.includes("tamir") || selectedStyle.includes("restore") || selectedStyle.includes("aydınlat")) {
            hfModel = "Qwen/Qwen-Image-Edit-2511"; // Resmî kararlı sürüm
        }

        // 2. GEMINI ANALİZİ
        const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
        const analysisPrompt = `Analyze photo. Style: ${selectedStyle}. 
        Action: Keep people 99% identical. Modify background/lighting to ${selectedStyle}. 
        Return only the prompt.`;
        
        const visionResult = await geminiModel.generateContent([analysisPrompt, {
            inlineData: { data: base64Image, mimeType: req.file.mimetype }
        }]);
        const finalPrompt = visionResult.response.text();

        // 3. AKILLI FETCH SİSTEMİ (Retry & Fallback)
        async function fetchFromHF(model, payload) {
            const url = `https://api-inference.huggingface.co/models/${model}`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
                method: "POST",
                body: JSON.stringify(payload),
            });
            return response;
        }

        let payload = (modelType === "qwen") 
            ? { inputs: finalPrompt, image: base64Image } 
            : { inputs: base64Image, parameters: { prompt: finalPrompt, strength: 0.35 } };

        let hfResponse = await fetchFromHF(hfModel, payload);

        // EĞER 410 VEYA 404 ALIRSAK, ANA MODELLE DEVAM ET (ULTRA FALLBACK)
        if (!hfResponse.ok) {
            console.warn(`${hfModel} hata (${hfResponse.status}) verdi, ana modele geçiliyor...`);
            // En kararlı ana model: Qwen-Image-Edit-2511
            hfResponse = await fetchFromHF("Qwen/Qwen-Image-Edit-2511", { inputs: finalPrompt, image: base64Image });
            
            if (!hfResponse.ok) {
                // Eğer o da hata verirse son çare Stable Diffusion XL
                hfResponse = await fetchFromHF("stabilityai/stable-diffusion-xl-base-1.0", { 
                    inputs: base64Image, 
                    parameters: { prompt: finalPrompt, strength: 0.25 } 
                });
            }
        }

        if (!hfResponse.ok) throw new Error(`Hugging Face servis dışı (${hfResponse.status})`);

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
        res.status(500).send(`Sistem Hatası: ${error.message}`);
    }
});

if (!fs.existsSync('uploads')){ fs.mkdirSync('uploads'); }
app.listen(port, () => console.log(`Sunucu aktif: Port ${port}`));
