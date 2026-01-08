document.addEventListener('DOMContentLoaded', () => {
    // 14 Sabit Stil Tanımlamaları
    const styles = [
        { id: "pixar", name: "3D Pixar", prompt: "Pixar tarzında, stüdyo ışıklandırmalı, yüksek çözünürlüklü bir 3D karakter portresi. Cilt detayları, yumuşak renk geçişleri ve animasyon estetiği ön planda." },
        { id: "oil", name: "Yağlı Boya", prompt: "Yağlı boya tablo tarzında, gerçekçi detaylarla işlenmiş portre. Fırça darbeleri belirgin, sanatsal ve derinlikli." },
        { id: "anime70", name: "70'ler Anime", prompt: "1970’ler estetiğinde, büyük gözlü ve duygulu bakışlara sahip anime tarzında zarif bir yüz ve hafif dramatik hava." },
        { id: "muppet", name: "Muppet Kukla", prompt: "Muppet’lardan ilham alan kukla tarzında dijital bir illüstrasyon. Gerçekçi keçe dokuları, ifadeli kukla yüzleri." },
        { id: "cyber", name: "Cyberpunk", prompt: "Cyberpunk atmosferi, neon pembe ve mavi ışık yansımaları, fütüristik ve sinematik gece çekimi." },
        { id: "office", name: "Kurumsal", prompt: "Lüks bir ofis ortamında profesyonel kurumsal portre, LinkedIn kalitesinde, hafif arka plan bulanıklığı." },
        { id: "ghibli", name: "Ghibli", prompt: "Studio Ghibli anime karesi, canlı ama yumuşak renk paleti, elle çizilmiş sulu boya dokusu." },
        { id: "marble", name: "Heykel", prompt: "Antik mermer heykel, pürüzsüz taş dokusu, hafif çatlaklar ve müze ışıklandırması." },
        { id: "lego", name: "LEGO", prompt: "LEGO dünyasına dönüştürülmüş karakter ve çevre. Plastik yansımaları ve canlı renkler." },
        { id: "vintage90", name: "90'lar Film", prompt: "1990’lar 35mm film karesi, hafif film kumlanması, nostaljik sıcak tonlar." },
        { id: "sketch", name: "Karakalem", prompt: "Profesyonel karakalem eskiz, keskin hatlar, gölgelendirme ve grafit kağıt dokusu." },
        { id: "steam", name: "Steampunk", prompt: "Viktorya dönemi Steampunk stili, pirinç detaylar, dişliler ve deri aksesuarlar." },
        { id: "double", name: "Çift Pozlama", prompt: "Sürreal Çift Pozlama. Kişinin silüeti ile iç içe geçmiş devasa bir çam ormanı ve yıldızlı gece gökyüzü." },
        { id: "hero", name: "Süper Kahraman", prompt: "Modern çizgi roman kapağı tarzı, kalın konturlar, canlı ana renkler ve aksiyon dolu atmosfer." }
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

    // 1. Stilleri Dinamik Olarak Oluştur (Grid'e Ekle)
    styles.forEach(style => {
        const btn = document.createElement('button');
        btn.className = 'style-card';
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

    // 2. Dosya Yükleme İşlemleri
    dropZone.onclick = () => imageInput.click();
    imageInput.onchange = (e) => handleFile(e.target.files[0]);

    function handleFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            sourcePreview.src = e.target.result;
            previewArea.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }

    // 3. İyileştirme Butonları (Aydınlatma & Upscale)
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.onclick = () => {
            const type = btn.dataset.type;
            const prompt = type === 'brighten' 
                ? "Fotoğrafı profesyonelce aydınlat, karanlık alanları detaylandır ve renkleri canlandır." 
                : "Görüntü çözünürlüğünü 4 kat arttır, detayları netleştir ve keskinleştir.";
            processImage(prompt);
        };
    });

    // 4. Arka Plan Değiştirme Menüsü
    bgMasterBtn.onclick = () => bgMenu.style.display = bgMenu.style.display === 'none' ? 'block' : 'none';
    
    applyBgBtn.onclick = () => {
        const location = document.getElementById('location-select').value;
        const prompt = `Kişiyi/süjeyi sabit tutarak arka planı tamamen sil ve yerine şunu ekle: ${location}. Işık ve gölgeleri uyumlu hale getir.`;
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
        resultArea.scrollIntoView({ behavior: 'smooth' });

        const formData = new FormData();
        formData.append('image', file);
        formData.append('prompt', finalPrompt);

        try {
            // Not: Render'a yüklediğinizde bu URL otomatik olarak çalışacaktır.
            const response = await fetch('/api/process', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('API Hatası');

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            
            resultImg.src = url;
            resultImg.style.display = 'block';
            document.getElementById('download-btn').href = url;
        } catch (err) {
            alert("Hata Detayı: " + err.message + "\nLütfen Render loglarını kontrol edin.");
        } finally {
            loader.style.display = 'none';
        }
    }
});
