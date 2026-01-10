document.addEventListener('DOMContentLoaded', () => {
    // 20 Detaylı Stil Tanımlaması
    const styles = [
        { id: "pixar", name: "3D Pixar", prompt: "3D Pixar style, studio lighting, high resolution 3D character portrait. Maintain original facial features and expressions 99%." },
        { id: "oil", name: "Yağlı Boya", prompt: "Professional oil painting, thick brushstrokes, artistic texture, deep colors while keeping the person's identity identical." },
        { id: "anime70", name: "70'ler Anime", prompt: "1970s classic anime aesthetic, hand-drawn look, nostalgic warm tones, maintain the exact eyes and face shape." },
        { id: "muppet", name: "Muppet Kukla", prompt: "Muppet-inspired puppet style, realistic felt textures, keep the original facial structure within a puppet form." },
        { id: "cyber", name: "Cyberpunk", prompt: "Cyberpunk atmosphere, neon pink and blue lighting, futuristic night city background, keep the faces photorealistic." },
        { id: "office", name: "Kurumsal", prompt: "Professional corporate LinkedIn headshot, luxury office background, high-end photography, keep faces 100% identical." },
        { id: "ghibli", name: "Ghibli", prompt: "Studio Ghibli anime style, watercolor textures, vibrant soft colors, keep the subjects' original expressions." },
        { id: "marble", name: "Heykel", prompt: "Ancient marble sculpture, smooth stone texture, museum lighting, maintain the exact facial bone structure." },
        { id: "lego", name: "LEGO", prompt: "LEGO world conversion, plastic textures, LEGO bricks environment, keep the people's faces as high-detail print on heads." },
        { id: "vintage90", name: "90'lar Film", prompt: "1990s 35mm film shot, film grain, nostalgic warm colors, maintain 99% facial identity." },
        { id: "sketch", name: "Karakalem", prompt: "Professional graphite pencil sketch, sharp lines, detailed shading on paper texture, keep the facial features exact." },
        { id: "steam", name: "Steampunk", prompt: "Victorian Steampunk style, brass and leather textures, gears in background, keep original faces unchanged." },
        { id: "double", name: "Çift Pozlama", prompt: "Surreal Double Exposure, silhouette merged with a pine forest and starry night, maintain 99% face likeness." },
        { id: "hero", name: "Süper Kahraman", prompt: "Modern comic book cover, bold outlines, action atmosphere, keep the original facial features clearly visible." },
        // YENİ EKLENEN 6 STİL (20'ye Tamamlayan Uzmanlıklar)
        { id: "chibi", name: "3D Chibi", prompt: "Cute 3D Chibi character, big head small body, maintain 99% facial likeness on a cute stylized 3D model." },
        { id: "book", name: "Eskiz Defteri", prompt: "Artist's sketchbook drawing, messy pencil lines, artistic charcoal texture, keep facial identity perfect." },
        { id: "night", name: "Gece Işığı", prompt: "Dramatic cinematic night lighting, moonlight shadows, blue and gold tones, maintain original faces 99%." },
        { id: "restore", name: "Fotoğraf Tamiri", prompt: "Professional photo restoration, fix old damage, sharpen details, increase clarity while keeping the identity 100%." },
        { id: "cinema", name: "Sinematik Portre", prompt: "Hollywood movie close-up, anamorphic lens flares, high contrast lighting, keep the faces identical to the source." },
        { id: "ink", name: "Mürekkep Çizim", prompt: "Traditional Chinese ink wash painting style, black and white aesthetic, maintain the person's exact facial structure." }
    ];

    const styleGrid = document.getElementById('style-grid');
    const imageInput = document.getElementById('image-input');
    const dropZone = document.getElementById('drop-zone');
    const sourcePreview = document.getElementById('source-preview');
    const previewArea = document.getElementById('preview-area');
    const resultArea = document.getElementById('result-area');
    const resultImg = document.getElementById('result-img');
    const loader = document.getElementById('loader');
    const bgMasterBtn = document.getElementById('bg-master-btn');
    const bgMenu = document.getElementById('bg-menu');
    const applyBgBtn = document.getElementById('apply-bg');

    // 1. Stilleri Dinamik Olarak Oluştur
    styles.forEach(style => {
        const btn = document.createElement('button');
        btn.className = 'style-card';
        btn.setAttribute('data-style', style.name); // Server.js router uyumu için
        btn.innerHTML = `
            <div class="img-box">
                <img src="https://picsum.photos/seed/${style.id}/200" alt="${style.name}">
                <div class="overlay">Uygula</div>
            </div>
            <span>${style.name}</span>
        `;
        btn.onclick = () => processImage(style.prompt);
        styleGrid.appendChild(btn);
    });

    // 2. Dosya Yükleme ve Sürükle-Bırak
    dropZone.onclick = () => imageInput.click();
    imageInput.onchange = (e) => handleFile(e.target.files[0]);

    function handleFile(file) {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            sourcePreview.src = e.target.result;
            previewArea.style.display = 'block';
            dropZone.style.display = 'none';
        };
        reader.readAsDataURL(file);
    }

    // 3. İyileştirme Butonları (HTML'deki data-type ile uyumlu)
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.onclick = () => {
            const type = btn.getAttribute('data-type');
            let prompt = "";
            if (type === "Aydınlat") prompt = "Brighten the photo professionally, bring out details in shadows.";
            else if (type === "Fotoğraf Tamiri") prompt = "Restore old photo, fix scratches, sharpen and clarify the face 100%.";
            
            processImage(prompt);
        };
    });

    // 4. Arka Plan Değiştirme Menüsü
    bgMasterBtn.onclick = () => bgMenu.style.display = bgMenu.style.display === 'none' ? 'block' : 'none';
    
    applyBgBtn.onclick = () => {
        const location = document.getElementById('location-select').value;
        const prompt = `Keep the people identical. Change only the background to: ${location}. Match lighting and shadows.`;
        processImage(prompt);
        bgMenu.style.display = 'none';
    };

    // 5. ANA FONKSİYON: API İsteği Gönder
    async function processImage(finalPrompt) {
        const file = imageInput.files[0];
        if (!file) return alert("Lütfen önce bir fotoğraf yükleyin!");

        resultArea.style.display = 'block';
        loader.style.display = 'block';
        resultImg.style.display = 'none';
        document.getElementById('download-btn').style.display = 'none';
        resultArea.scrollIntoView({ behavior: 'smooth' });

        const formData = new FormData();
        formData.append('image', file);
        formData.append('prompt', finalPrompt);

        try {
            const response = await fetch('/api/process', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Model Hatası (404/500)');

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            
            resultImg.src = url;
            resultImg.style.display = 'inline-block';
            const dlBtn = document.getElementById('download-btn');
            dlBtn.href = url;
            dlBtn.style.display = 'inline-flex';
        } catch (err) {
            alert("Hata: " + err.message);
        } finally {
            loader.style.display = 'none';
        }
    }
});
