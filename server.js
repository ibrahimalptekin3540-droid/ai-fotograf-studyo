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

// API Anahtarları (Render ortam değişkenlerinden çekilir)
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

        // 1. AKILLI MODEL SEÇİCİ VE FORMAT BELİRLEYİCİ
        let hfModel = "Qwen/Qwen-Image-Edit-2511"; // Ana güvenli model
        let modelCategory = "qwen"; // Veri formatı tipi

        if (selectedStyle.includes("anime") || selectedStyle.includes("ghibli")) {
            hfModel = "autoweeb/Qwen-Image-Edit-2509-Photo-to-Anime";
        } else if (selectedStyle.includes("lego") || selectedStyle.includes("cyberpunk") || selectedStyle.includes("steampunk")) {
            hfModel = "black-forest-labs/FLUX.1-schnell"; 
            modelCategory = "flux";
        } else if (selectedStyle.includes("arka plan") || selectedStyle.includes("kurumsal")) {
            hfModel = "lovis93/next-scene-qwen-image-lora-2509";
        } else if (selectedStyle.includes("chibi") || selectedStyle.includes("pixar") || selectedStyle.includes("kukla")) {
            hfModel = "rsshekhawat/Qwen-Edit-3DChibi-LoRA";
        } else if (selectedStyle.includes("karakalem") || selectedStyle.includes("eskiz")) {
            hfModel = "tlennon-ie/qwen-edit-skin";
        } else if (selectedStyle.includes("tamir") || selectedStyle.includes("restore")) {
            hfModel = "prithivMLmods/Photo-Restore-i2i";
        }

        // 2. GEMINI 2.5 FLASH İLE YÜKSEK SADAKATLİ TALİMAT
        const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
        const analysisPrompt = `Target Style: ${selectedStyle}. 
        Identify the people in this photo. Create a technical instruction for the AI model ${hfModel}. 
        CRITICAL: Command the AI to keep the people's facial structures, expressions, and identities 99% identical. 
        Only transform the background, clothing, and artistic lighting to match the ${selectedStyle} aesthetic. 
        Only return the prompt text.`;
        
        const visionResult = await geminiModel.generateContent([analysisPrompt, {
            inlineData: { data: base64Image, mimeType: req.file.mimetype }
        }]);
        const finalInstruction = visionResult.response.text();
        console.log(`Uygulanan Model: ${hfModel} | Talimat: ${finalInstruction}`);

        // 3. HUGGING FACE API ÇAĞRISI (Hata Yönetimli)
        const hfURL = `https://api-inference.huggingface.co/models/${hfModel}`;
        
        // Model tipine göre JSON gövdesini hazırlıyoruz (400 hatasını önler)
        let payload;
        if (modelCategory === "qwen") {
            payload = { inputs: finalInstruction, image: base64Image };
        } else {
            payload = { inputs: base64Image, parameters: { prompt: finalInstruction, strength: 0.35 } };
        }

        let hfResponse = await fetch(hfURL, {
            headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
            method: "POST",
            body: JSON.stringify(payload),
        });

        // EĞER ÖZEL MODEL HATA VERİRSE (404/503), YEDEK MODELE GEÇ
        if (!hfResponse.ok) {
            console.warn(`${hfModel} hata verdi, güvenli yedek modele geçiliyor...`);
            const fallbackURL = "https://api-inference.huggingface.co/models/Qwen/Qwen-Image-Edit-2511";
            hfResponse = await fetch(fallbackURL, {
                headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
                method: "POST",
                body: JSON.stringify({ inputs: finalInstruction, image: base64Image }),
            });
            
            if (!hfResponse.ok) throw new Error(`Tüm modeller yanıt vermiyor (${hfResponse.status})`);
        }

        const buffer = await hfResponse.buffer();
        const outputPath = `uploads/edited_${Date.now()}.png`;
        fs.writeFileSync(outputPath, buffer);

        // 4. SONUCU GÖNDER VE TEMİZLE
        res.sendFile(path.resolve(outputPath), () => {
            if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        });

    } catch (error) {
        console.error("KRİTİK SUNUCU HATASI:", error.message);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).send(`İşlem Başarısız: ${error.message}`);
    }
});

if (!fs.existsSync('uploads')){ fs.mkdirSync('uploads'); }
app.listen(port, () => console.log(`Sanat Stüdyosu Sunucusu ${port} portunda aktif!`));
