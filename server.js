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

const hf = new HfInference(process.env.HF_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

app.post('/api/process', upload.single('image'), async (req, res) => {
    try {
        if (!req.file || !req.body.prompt) return res.status(400).send("Dosya eksik.");

        const selectedStyle = req.body.prompt;
        const imageBuffer = fs.readFileSync(req.file.path);

        // 1. KRİTİK ÇÖZÜM: Buffer'ı Blob'a çeviriyoruz
        // Bu adım "arrayBuffer is not a function" hatasını kalıcı olarak durdurur.
        const imageBlob = new Blob([imageBuffer], { type: req.file.mimetype });

        // 2. GEMINI ANALİZİ
        const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
        const analysisPrompt = `Target Style: ${selectedStyle}. Keep the person's identity 99% identical. Only change the style. Return only prompt.`;
        const visionResult = await geminiModel.generateContent([
            analysisPrompt, 
            { inlineData: { data: imageBuffer.toString("base64"), mimeType: req.file.mimetype } }
        ]);
        const finalPrompt = visionResult.response.text();

        // 3. MODEL SEÇİMİ
        let modelId = "Qwen/Qwen-Image-Edit"; 
        if (selectedStyle.includes("anime")) modelId = "autoweeb/Qwen-Image-Edit-2509-Photo-to-Anime";
        else if (selectedStyle.includes("lego") || selectedStyle.includes("pixar")) modelId = "black-forest-labs/FLUX.1-schnell";

        // 4. HUGGING FACE ÇAĞRISI (Provider: Auto)
        // imageBlob kullandığımız için artık hata vermeyecek.
        const resultBlob = await hf.imageToImage({
            model: modelId,
            inputs: imageBlob, 
            provider: "auto", 
            parameters: { 
                prompt: finalPrompt,
                strength: 0.25 
            }
        });

        const outputBuffer = Buffer.from(await resultBlob.arrayBuffer());
        const outputPath = `uploads/res_${Date.now()}.png`;
        fs.writeFileSync(outputPath, outputBuffer);

        res.sendFile(path.resolve(outputPath), () => {
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        });

    } catch (error) {
        console.error("KRİTİK HATA:", error.message);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).send(`Sistem Hatası: ${error.message}`);
    }
});

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
app.listen(port, () => console.log(`Sanat Stüdyosu Yayında!`));
