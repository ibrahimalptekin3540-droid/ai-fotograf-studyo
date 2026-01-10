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

        // 1. STİL-MODEL EŞLEŞTİRME (En Kararlı Modeller Seçildi)
        let hfModel = "Qwen/Qwen-Image-Edit-2511"; // Ana Güvenli Model
        let modelCategory = "qwen";

        if (selectedStyle.includes("anime") || selectedStyle.includes("ghibli")) {
            hfModel = "autoweeb/Qwen-Image-Edit-2509-Photo-to-Anime";
        } else if (selectedStyle.includes("lego") || selectedStyle.includes("cyberpunk") || selectedStyle.includes("pixar")) {
            hfModel = "black-forest-labs/FLUX.1-schnell"; // En yüksek uptime
            modelCategory = "flux";
        } else if (selectedStyle.includes("karakalem") || selectedStyle.includes("eskiz")) {
            hfModel = "tlennon-ie/qwen-edit-skin";
        } else if (selectedStyle.includes("tamir") || selectedStyle.includes("restore")) {
            hfModel = "prithivMLmods/Photo-Restore-i2i";
        }

        // 2. GEMINI ANALİZİ
        const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
        const analysisPrompt = `Target Style: ${selectedStyle}. 
        Instruction: Keep people 99% identical. Modify background and light to ${selectedStyle}. 
        Return ONLY the instruction text.`;
        
        const visionResult = await geminiModel.generateContent([analysisPrompt, {
            inlineData: { data: base64Image, mimeType: req.file.mimetype }
        }]);
        const finalPrompt = visionResult.response.text();

        // 3. HUGGING FACE ÇAĞRISI (Gelişmiş Hata Yönetimi)
        async function tryHuggingFace(model, category, prompt, image) {
            const url = `https://api-inference.huggingface.co/models/${model}`;
            const payload = (category === "qwen") 
                ? { inputs: prompt, image: image } 
                : { inputs: image, parameters: { prompt: prompt, strength: 0.3 } };

            return await fetch(url, {
                headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
                method: "POST",
                body: JSON.stringify(payload),
            });
        }

        let hfResponse = await tryHuggingFace(hfModel, modelCategory, finalPrompt, base64Image);

        // FALLBACK: Eğer 404/500 veya 503 (Yükleniyor) hatası gelirse
        if (!hfResponse.ok) {
            console.warn(`${hfModel} hata verdi (${hfResponse.status}). Yedek modele geçiliyor...`);
            // Yedek: Her zaman aktif olan Qwen Image Edit Base
            hfResponse = await tryHuggingFace("Qwen/Qwen-Image-Edit-2511", "qwen", finalPrompt, base64Image);
            
            if (!hfResponse.ok) {
                // Son çare: Stable Diffusion XL
                hfResponse = await tryHuggingFace("stabilityai/stable-diffusion-xl-base-1.0", "flux", finalPrompt, base64Image);
            }
        }

        if (!hfResponse.ok) throw new Error(`Modeller yanıt vermiyor. Durum: ${hfResponse.status}`);

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
app.listen(port, () => console.log(`Sunucu aktif: Port ${port}`));
