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
        if (!req.file || !req.body.prompt) return res.status(400).send("Dosya veya stil eksik.");

        const selectedStyle = req.body.prompt.toLowerCase();
        const imagePath = req.file.path;
        const imageBuffer = fs.readFileSync(imagePath);
        const base64Image = imageBuffer.toString("base64");

        // 1. MODEL VE SAĞLAYICI (PROVIDER) HARİTASI
        // Gönderdiğiniz kod snippet'larına göre konfigüre edildi
        let modelConfig = {
            model: "Qwen/Qwen-Image-Edit-2511",
            provider: "fal-ai", // Varsayılan en güçlü sağlayıcı
            type: "image-to-image"
        };

        if (selectedStyle.includes("anime") || selectedStyle.includes("ghibli")) {
            modelConfig = { model: "autoweeb/Qwen-Image-Edit-2509-Photo-to-Anime", provider: "wavespeed" };
        } else if (selectedStyle.includes("lego") || selectedStyle.includes("cyber") || selectedStyle.includes("pixar")) {
            modelConfig = { model: "black-forest-labs/FLUX.1-Kontext-dev", provider: "fal-ai" };
        } else if (selectedStyle.includes("chibi") || selectedStyle.includes("kukla")) {
            modelConfig = { model: "rsshekhawat/Qwen-Edit-3DChibi-LoRA", provider: "wavespeed" };
        } else if (selectedStyle.includes("karakalem") || selectedStyle.includes("yağlı")) {
            modelConfig = { model: "tlennon-ie/qwen-edit-skin", provider: "wavespeed" };
        } else if (selectedStyle.includes("tamir") || selectedStyle.includes("restore") || selectedStyle.includes("sinematik")) {
            modelConfig = { model: "prithivMLmods/Photo-Restore-i2i", provider: "fal-ai" };
        } else if (selectedStyle.includes("arka plan") || selectedStyle.includes("kurumsal")) {
            modelConfig = { model: "lovis93/next-scene-qwen-image-lora-2509", provider: "wavespeed" };
        }

        // 2. GEMINI ANALİZİ (%99 BENZERLİK TALİMATI)
        const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
        const analysisPrompt = `Analysis: Style ${selectedStyle}. 
        Constraint: Keep people's identity 99% identical. Only change environment and texture. 
        Only return the prompt text.`;
        
        const visionResult = await geminiModel.generateContent([analysisPrompt, {
            inlineData: { data: imageBuffer.toString("base64"), mimeType: req.file.mimetype }
        }]);
        const finalPrompt = visionResult.response.text();
        console.log(`Model: ${modelConfig.model} | Provider: ${modelConfig.provider} | Talimat: ${finalPrompt}`);

        // 3. HUGGING FACE API ÇAĞRISI (Kod Örneklerinize Göre)
        const hfURL = `https://api-inference.huggingface.co/models/${modelConfig.model}`;
        
        // PAYLOAD: Gönderdiğiniz 'parameters' yapısına tam uyum
        const payload = {
            inputs: base64Image,
            provider: modelConfig.provider,
            parameters: { 
                prompt: finalPrompt,
                strength: 0.25 // Sadakat için düşük tutuldu
            }
        };

        const hfResponse = await fetch(hfURL, {
            headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
            method: "POST",
            body: JSON.stringify(payload),
        });

        // 410 VEYA KREDİ HATASI DURUMUNDA GÜVENLİ YEDEK
        if (!hfResponse.ok) {
            console.warn(`Provider ${modelConfig.provider} hata verdi (${hfResponse.status}). Yedek Qwen kanalına geçiliyor...`);
            const fallbackPayload = { inputs: finalPrompt, image: base64Image };
            const fallbackURL = "https://api-inference.huggingface.co/models/Qwen/Qwen-Image-Edit-2511";
            var finalResponse = await fetch(fallbackURL, {
                headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
                method: "POST",
                body: JSON.stringify(fallbackPayload),
            });
            if (!finalResponse.ok) throw new Error("Tüm kanallar meşgul.");
        } else {
            var finalResponse = hfResponse;
        }

        const buffer = await finalResponse.buffer();
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
app.listen(port, () => console.log(`Hatasız 20 Stil Aktif!`));
