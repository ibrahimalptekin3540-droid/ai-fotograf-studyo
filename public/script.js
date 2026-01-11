document.addEventListener('DOMContentLoaded', () => {
    const imageInput = document.getElementById('image-input');
    const dropZone = document.getElementById('drop-zone');
    const sourcePreview = document.getElementById('source-preview');
    const previewArea = document.getElementById('preview-area');
    const resultArea = document.getElementById('result-area');
    const resultImg = document.getElementById('result-img');
    const loader = document.getElementById('loader');
    const downloadBtn = document.getElementById('download-btn');
    const bgMasterBtn = document.getElementById('bg-master-btn');
    const bgMenu = document.getElementById('bg-menu');
    const applyBg = document.getElementById('apply-bg');
    const locationSelect = document.getElementById('location-select');

    let currentResultUrl = null; // Bellek yönetimi için

    // Dosya Seçme İşlemleri
    dropZone.onclick = () => imageInput.click();
    imageInput.onchange = (e) => handleFile(e.target.files[0]);

    function handleFile(file) {
        if (!file || !file.type.startsWith('image/')) {
            return alert("Lütfen geçerli bir görsel dosyası seçin.");
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            sourcePreview.src = e.target.result;
            previewArea.style.display = 'block';
            dropZone.style.display = 'none';
            // Yeni fotoğraf yüklendiğinde eski sonuç alanını gizle
            resultArea.style.display = 'none';
        };
        reader.readAsDataURL(file);
    }

    // ARKA PLAN MENÜSÜNÜ AÇMA (Düzeltme)
    bgMasterBtn.onclick = () => {
        bgMenu.style.display = bgMenu.style.display === 'none' ? 'block' : 'none';
        if (bgMenu.style.display === 'block') {
            bgMenu.scrollIntoView({ behavior: 'smooth' });
        }
    };

    // Arka Plan Uygulama
    applyBg.onclick = () => {
        const location = "Arka planı şu mekanla değiştir: " + locationSelect.value;
        processImage(location);
    };

    // Standart Stil Kartları (24 Stil)
    document.querySelectorAll('.style-card:not(.special)').forEach(card => {
        card.onclick = () => processImage(card.getAttribute('data-style'));
    });

    async function processImage(styleName) {
        const file = imageInput.files[0];
        if (!file) return alert("Önce fotoğraf yükleyin!");

        // UI Hazırlığı
        resultArea.style.display = 'block';
        loader.style.display = 'block';
        resultImg.style.display = 'none';
        downloadBtn.style.display = 'none';
        resultArea.scrollIntoView({ behavior: 'smooth' });

        const formData = new FormData();
        formData.append('image', file);
        formData.append('prompt', styleName);

        try {
            const response = await fetch('/api/process', { method: 'POST', body: formData });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Sunucu Hatası');
            }

            // BELLEK YÖNETİMİ: Eski Blob URL'sini temizle
            if (currentResultUrl) {
                URL.revokeObjectURL(currentResultUrl);
            }

            const blob = await response.blob();
            currentResultUrl = URL.createObjectURL(blob);
            
            resultImg.src = currentResultUrl;
            resultImg.style.display = 'block';
            
            downloadBtn.href = currentResultUrl;
            // İndirme ismini stile göre özelleştir
            downloadBtn.download = `ai-studio-${styleName.replace(/\s+/g, '-').toLowerCase()}.png`;
            downloadBtn.style.display = 'inline-flex';

        } catch (err) {
            console.error("İşlem Hatası:", err);
            alert("Üzgünüz, bir hata oluştu: " + err.message);
            resultArea.style.display = 'none';
        } finally {
            // ALTIN KURAL 3: Loader her koşulda gizlenir
            loader.style.display = 'none';
        }
    }
});
