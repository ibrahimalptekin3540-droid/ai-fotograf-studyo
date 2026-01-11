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

    // Dosya Seçme
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

    // ARKA PLAN MENÜSÜNÜ AÇMA (Düzeltme)
    bgMasterBtn.onclick = () => {
        bgMenu.style.display = bgMenu.style.display === 'none' ? 'block' : 'none';
        bgMenu.scrollIntoView({ behavior: 'smooth' });
    };

    // Arka Plan Uygulama
    applyBg.onclick = () => {
        const location = "Arka planı şu mekanla değiştir: " + locationSelect.value;
        processImage(location);
    };

    // Standart Stil Kartları
    document.querySelectorAll('.style-card:not(.special)').forEach(card => {
        card.onclick = () => processImage(card.getAttribute('data-style'));
    });

    async function processImage(styleName) {
        const file = imageInput.files[0];
        if (!file) return alert("Önce fotoğraf yükleyin!");

        resultArea.style.display = 'block';
        loader.style.display = 'block';
        resultImg.style.display = 'none';
        downloadBtn.style.display = 'none';

        const formData = new FormData();
        formData.append('image', file);
        formData.append('prompt', styleName);

        try {
            const response = await fetch('/api/process', { method: 'POST', body: formData });
            if (!response.ok) throw new Error('Sunucu Hatası');

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            resultImg.src = url;
            resultImg.style.display = 'block';
            downloadBtn.href = url;
            downloadBtn.style.display = 'inline-flex';
        } catch (err) {
            alert(err.message);
        } finally {
            loader.style.display = 'none';
        }
    }
});
