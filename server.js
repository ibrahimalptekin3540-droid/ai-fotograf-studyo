const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fal = require("@fal-ai/serverless-client");
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;

// GÜVENLİK GÜNCELLEMESİ: Sadece 'public' klasörünü dışarı açar
app.use(express.static('public'));
app.use(cors());

// ALTIN KURAL 1: Fotoğrafları disk yerine RAM'de tutan yapılandırma
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB dosya boyutu sınırı
});

fal.config({ credentials: process.env.FAL_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

app.post('/api/process', upload.single('image'), async (req, res) => {
    try {
        if (!req.file || !req.body.prompt) return res.status(400).send("Veri eksik.");

        // Fotoğraf verisini doğrudan RAM'den (buffer) alıyoruz
        const imageBase64 = req.file.buffer.toString("base64");
        const base64Image = `data:${req.file.mimetype};base64,${imageBase64}`;

        // 1. GEMINI ANALİZİ (Stil Özelleştirme & Cilt Retouch)
        const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
        const analysisPrompt = `Target Style: ${req.body.prompt}. 
        
        STRICT INSTRUCTIONS: 
        1. IDENTITY & SKIN: Maintain person's features 99% identical BUT provide professional skin retouching. Remove all facial moles, marks, spots, and blemishes. Output must have clear, smooth skin.
        2. STYLE UNIQUENESS: Apply extreme, high-contrast stylistic features unique to ${req.body.prompt}. Use specific keywords for textures (e.g., thick impasto for oil, 8k octane render for 3D, vintage grain for 90s).
        3. REALISTIC BACKGROUNDS: If a background location is requested, use photorealistic 8k environmental lighting, natural depth of field (bokeh), and global illumination. The person must look like they are physically there with realistic shadows and color matching. 
        4. OUTLINE: Add a very thin, clean aesthetic outline around the subject.
        
        Return ONLY the optimized, highly descriptive prompt text.`;

        const visionResult = await geminiModel.generateContent([
            analysisPrompt, 
            { inlineData: { data: imageBase64, mimeType: req.file.mimetype } }
        ]);
        const finalPrompt = visionResult.response.text();

        // 2. FAL.AI ÇAĞRISI
        const result = await fal.subscribe("fal-ai/qwen-image-edit", {
            input: {
                image_url: base64Image,
                prompt: finalPrompt,
                strength: 0.25
            }
        });

        // 3. SONUÇ YAKALAMA
        let editedImageUrl = result.image?.url || result.images?.[0]?.url;
        if (!editedImageUrl) throw new Error("Görsel URL'si bulunamadı.");

        // 4. SONUCU RAM ÜZERİNDEN GÖNDERME (Diske yazma/silme yok)
        const response = await fetch(editedImageUrl);
        if (!response.ok) throw new Error("Görsel indirilemedi.");
        
        const buffer = await response.buffer();

        // Yanıt başlığını görsel olarak ayarla ve buffer'ı gönder
        res.set('Content-Type', 'image/png');
        res.send(buffer);

    } catch (error) {
        console.error("HATA:", error.message);
        res.status(500).send(`Sistem Hatası: ${error.message}`);
    }
    // RAM kullanımı sayesinde 'finally' bloğunda disk silme komutuna gerek kalmadı!
});

// Artık 'uploads' klasörü oluşturmaya gerek yok
app.listen(port, () => console.log(`Güvenli AI Stüdyo 3.0 (RAM-Only) Yayında!`));
