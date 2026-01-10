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

// API Anahtarları (Render Environment Variables üzerinden okunur)
const hf = new HfInference(process.env.HF_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

app.post('/api/process', upload.single('image'), async (req, res) => {
    try {
        if (!req.file || !req.body.prompt) return res.status(400).send("Dosya veya stil seçimi eksik.");

        const selectedStyle = req.body.prompt;
        const imagePath = req.file.path;
        const imageBuffer = fs.readFileSync(imagePath);
        
        // KRİTİK DÜZELTME: "arrayBuffer is not a function" hatasını bitiren dönüşüm
        const uint8Array = new Uint8Array(imageBuffer);

        // 1. GEMINI ANALİZİ (%99 Yüz Sadakati Talimatı)
        const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
        const analysisPrompt = `Target Style: ${selectedStyle}. 
        Instruction: Maintain the people's facial features and identity 99% identical. 
        Only transform the background and style textures. Return only the prompt text.`;
        
        const visionResult = await geminiModel.generateContent([
            analysisPrompt, 
            { inlineData: { data: imageBuffer.toString("base64"), mimeType: req.file.mimetype } }
        ]);
        const finalPrompt = visionResult.response.text();

        // 2. MODEL SEÇİCİ
        let modelId = "Qwen/Qwen-Image-Edit"; // Ana ücretsiz model
        if (selectedStyle.includes("anime")) modelId = "autoweeb/Qwen-Image-Edit-2509-Photo-to-Anime";
        else if (selectedStyle.includes("lego") || selectedStyle.includes("pixar")) modelId = "black-forest-labs/FLUX.1-schnell";

        // 3. HUGGING FACE ÇAĞRISI (Ücretsiz Kanalı Zorla)
        const resultBlob = await hf.imageToImage({
            model: modelId,
            inputs: uint8Array, // Saf veri gönderimi
            provider: "hf-inference", // fal-ai kredi engelini ve 410 hatasını aşar
            parameters: { 
                prompt: finalPrompt,
                strength: 0.25 // Orijinal yüzü koruma hassasiyeti
            }
        });

        // Blob -> Buffer Dönüşümü ve Kaydetme
        const outputBuffer = Buffer.from(await resultBlob.arrayBuffer());
        const outputPath = `uploads/res_${Date.now()}.png`;
        fs.writeFileSync(outputPath, outputBuffer);

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

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
app.listen(port, () => console.log(`Sanat Stüdyosu Yayında!`));
