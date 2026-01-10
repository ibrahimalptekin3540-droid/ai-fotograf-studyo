document.addEventListener('DOMContentLoaded', () => {
    const imageInput = document.getElementById('image-input');
    const dropZone = document.getElementById('drop-zone');
    const sourcePreview = document.getElementById('source-preview');
    const previewArea = document.getElementById('preview-area');
    const resultArea = document.getElementById('result-area');
    const resultImg = document.getElementById('result-img');
    const loader = document.getElementById('loader');
    const downloadBtn = document.getElementById('download-btn');

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

    // Tüm stil kartlarına ve işlem butonlarına tıklama özelliği
    document.querySelectorAll('.style-card, .action-btn').forEach(btn => {
        btn.onclick = () => {
            const style = btn.getAttribute('data-style') || btn.getAttribute('data-type');
            if (style) processImage(style);
        };
    });

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
        formData.append('prompt', styleName);

        try {
            const response = await fetch('/api/process', { method: 'POST', body: formData });
            if (!response.ok) throw new Error('API Hatası');

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
