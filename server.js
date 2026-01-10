const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { HfInference } = require("@huggingface/inference");
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('.')); 
const upload = multer({ dest: 'uploads/' });

// API Anahtarları (Render'dan çekilir)
const hf = new HfInference(process.env.HF_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

app.post('/api/process', upload.single('image'), async (req, res) => {
    try {
        if (!req.file || !req.body.prompt) return res.status(400).send("Eksik veri.");

        const selectedStyle = req.body.prompt.toLowerCase();
        const imagePath = req.file.path;
        const imageBuffer = fs.readFileSync(imagePath);

        // 1. GEMINI 2.5 ANALİZİ (Yüz Hatlarını %99 Koruma Talimatı)
        const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
        const analysisPrompt = `Analysis: Target Style is ${selectedStyle}. 
        CRITICAL: Create an instruction to transform this photo. 
        MANDATORY: Command the AI to keep the people's facial features and identity 99% identical. 
        Modify only the environment, lighting, and textures. Return ONLY the prompt text.`;
        
        const visionResult = await geminiModel.generateContent([analysisPrompt, {
            inlineData: { data: imageBuffer.toString("base64"), mimeType: req.file.mimetype }
        }]);
        const finalPrompt = visionResult.response.text();
        console.log(`Seçilen Stil: ${selectedStyle} | Üretilen Komut: ${finalPrompt}`);

        // 2. AKILLI MODEL SEÇİCİ
        let modelId = "Qwen/Qwen-Image-Edit"; // Varsayılan en sağlam model

        if (selectedStyle.includes("anime") || selectedStyle.includes("ghibli")) {
            modelId = "autoweeb/Qwen-Image-Edit-2509-Photo-to-Anime";
        } else if (selectedStyle.includes("lego") || selectedStyle.includes("cyber") || selectedStyle.includes("pixar")) {
            modelId = "black-forest-labs/FLUX.1-schnell";
        } else if (selectedStyle.includes("tamir") || selectedStyle.includes("restore")) {
            modelId = "prithivMLmods/Photo-Restore-i2i";
        }

        // 3. HUGGING FACE ÇAĞRISI (Provider: "Auto" Modu)
        // Bu yapı 410 ve kredi hatalarını otomatik yönetir.
        const resultBlob = await hf.imageToImage({
            model: modelId,
            inputs: imageBuffer,
            provider: "auto", // Akıllı yönlendirme devrede
            parameters: { 
                prompt: finalPrompt,
                strength: 0.25, // %99 benzerlik için ideal değer
                negative_prompt: "deformed face, changed identity, blurry, low quality"
            }
        });

        // Blob verisini Buffer'a çevirip kaydediyoruz
        const buffer = Buffer.from(await resultBlob.arrayBuffer());
        const outputPath = `uploads/res_${Date.now()}.png`;
        fs.writeFileSync(outputPath, buffer);

        // 4. SONUCU GÖNDER VE TEMİZLE
        res.sendFile(path.resolve(outputPath), () => {
            if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        });

    } catch (error) {
        console.error("SİSTEM HATASI:", error.message);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).send(`İşlem başarısız: ${error.message}`);
    }
});

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
app.listen(port, () => console.log(`20 Stilli AI Studio Pro Aktif!`));
