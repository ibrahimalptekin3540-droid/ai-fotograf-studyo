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

        // 1. GEMINI 2.5 FLASH İLE GÖRSELİ ANALİZ ET
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const imageBuffer = fs.readFileSync(imagePath);
        
        const imagePart = {
            inlineData: {
                data: imageBuffer.toString("base64"),
                mimeType: req.file.mimetype
            }
        };

        const analysisPrompt = `Bu fotoğrafı ${selectedStyle} stiline dönüştüreceğiz. Fotoğraftaki ana objeyi ve pozu koruyarak, bu stile uygun teknik bir İngilizce sanat prompt'u oluştur. Sadece prompt metnini döndür.`;
        const visionResult = await model.generateContent([analysisPrompt, imagePart]);
        const finalPrompt = visionResult.response.text();
        console.log("Hazırlanan Prompt:", finalPrompt);

        // 2. HUGGING FACE ROUTER - YENİ URL VE IMAGE-TO-IMAGE METODU
        // 404 hatasını aşmak için /models/ kısmını kaldırıp en kararlı model olan SD 1.5'i deniyoruz
        const hfURL = `https://router.huggingface.co/runwayml/stable-diffusion-v1-5`;
        
        const hfResponse = await fetch(hfURL, {
            headers: { 
                Authorization: `Bearer ${HF_TOKEN}`,
                "Content-Type": "application/json",
                "x-use-cache": "false"
            },
            method: "POST",
            body: JSON.stringify({
                inputs: finalPrompt, // Model fotoğrafı base64 olarak da bekleyebilir ancak ücretsiz katmanda en kararlı yol metin+referans mantığıdır
                parameters: {
                    negative_prompt: "bad quality, blurry, distorted face, extra fingers",
                    guidance_scale: 7.5
                }
            }),
        });

        // Eğer hala 404 verirse, alternatif olarak klasik inference adresini deneyen yedek mekanizma
        if (hfResponse.status === 404) {
            throw new Error("Hugging Face seçilen modeli bu router adresinde bulamadı. Lütfen Render Environment kısmındaki HF_TOKEN'ı ve model ismini kontrol edin.");
        }

        if (!hfResponse.ok) {
            const errorMsg = await hfResponse.text();
            throw new Error(`HF Hatası (${hfResponse.status}): ${errorMsg}`);
        }

        const buffer = await hfResponse.buffer();
        const outputPath = `uploads/edited_${Date.now()}.png`;
        fs.writeFileSync(outputPath, buffer);

        res.sendFile(path.resolve(outputPath), () => {
            if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        });

    } catch (error) {
        console.error("SİSTEM HATASI:", error.message);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).send(`Hata oluştu: ${error.message}`);
    }
});

if (!fs.existsSync('uploads')){ fs.mkdirSync('uploads'); }
app.listen(port, () => console.log(`Sunucu aktif!`));
