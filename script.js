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
    const applyBgBtn = document.getElementById('apply-bg');

    // 1. Dosya İşlemleri
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

    // 2. Stil Kartlarını Dinleme (HTML'deki data-style üzerinden)
    document.querySelectorAll('.style-card').forEach(card => {
        if (card.id === 'bg-master-btn') return; // Arka plan butonu özeldir
        card.onclick = () => processImage(card.getAttribute('data-style'));
    });

    // 3. İyileştirme Araçları
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.onclick = () => processImage(btn.getAttribute('data-type'));
    });

    // 4. Arka Plan Değişimi
    bgMasterBtn.onclick = () => bgMenu.style.display = bgMenu.style.display === 'none' ? 'block' : 'none';
    applyBgBtn.onclick = () => {
        const location = document.getElementById('location-select').value;
        processImage(`Arka Planı Değiştir: ${location}`);
        bgMenu.style.display = 'none';
    };

    // 5. API İletişimi
    async function processImage(styleName) {
        const file = imageInput.files[0];
        if (!file) return alert("Lütfen önce bir fotoğraf yükleyin!");

        resultArea.style.display = 'block';
        loader.style.display = 'block';
        resultImg.style.display = 'none';
        downloadBtn.style.display = 'none';
        resultArea.scrollIntoView({ behavior: 'smooth' });

        const formData = new FormData();
        formData.append('image', file);
        formData.append('prompt', styleName); // Server.js bu ismi alıp model seçecek

        try {
            const response = await fetch('/api/process', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Sunucu Hatası');

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            
            resultImg.src = url;
            resultImg.style.display = 'inline-block';
            downloadBtn.href = url;
            downloadBtn.style.display = 'inline-flex';
        } catch (err) {
            alert("Hata: " + err.message);
        } finally {
            loader.style.display = 'none';
        }
    }
});
