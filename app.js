class MultipleQRReader {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.fileInput = document.getElementById('fileInput');
        this.resultsContainer = document.getElementById('results');
        this.statusElement = document.getElementById('status');
        this.progressBar = document.getElementById('progressBar');
        
        this.stream = null;
        this.isScanning = false;
        this.scanInterval = null;
        
        this.initializeEventListeners();
        this.updateStatus('準備完了');
    }

    initializeEventListeners() {
        // Camera controls
        document.getElementById('startCamera').addEventListener('click', () => this.startCamera());
        document.getElementById('stopCamera').addEventListener('click', () => this.stopCamera());
        document.getElementById('captureImage').addEventListener('click', () => this.captureFromCamera());
        
        // File input
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    }

    async startCamera() {
        try {
            this.updateStatus('カメラを開始しています...');
            this.updateProgress(25);

            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });

            this.video.srcObject = this.stream;
            this.video.play();

            this.updateStatus('カメラが開始されました');
            this.updateProgress(100);
            
            document.getElementById('startCamera').disabled = true;
            document.getElementById('stopCamera').disabled = false;
            
            // Start continuous scanning
            this.startContinuousScanning();

        } catch (error) {
            console.error('Camera access error:', error);
            this.updateStatus('カメラへのアクセスができませんでした');
            this.showError('カメラにアクセスできません。ブラウザの設定を確認してください。');
            this.updateProgress(0);
        }
    }

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        this.video.srcObject = null;
        this.stopContinuousScanning();
        
        document.getElementById('startCamera').disabled = false;
        document.getElementById('stopCamera').disabled = true;
        
        this.updateStatus('カメラが停止されました');
        this.updateProgress(0);
    }

    startContinuousScanning() {
        this.isScanning = true;
        this.scanInterval = setInterval(() => {
            this.scanVideoFrame();
        }, 500); // Scan every 500ms
    }

    stopContinuousScanning() {
        this.isScanning = false;
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
    }

    captureFromCamera() {
        if (!this.video.videoWidth || !this.video.videoHeight) {
            this.showError('カメラが準備できていません');
            return;
        }

        this.updateStatus('画像を撮影して処理中...');
        this.updateProgress(50);
        
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        this.ctx.drawImage(this.video, 0, 0);
        
        this.processImage(this.canvas);
    }

    scanVideoFrame() {
        if (!this.video.videoWidth || !this.video.videoHeight || !this.isScanning) {
            return;
        }

        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        this.ctx.drawImage(this.video, 0, 0);
        
        // Process frame for QR codes (lighter processing for real-time)
        this.processImageQuick(this.canvas);
    }

    handleFileSelect(event) {
        const files = event.target.files;
        if (files.length === 0) return;

        this.updateStatus(`${files.length}個のファイルを処理中...`);
        this.updateProgress(0);
        
        this.clearResults();
        
        Array.from(files).forEach((file, index) => {
            if (file.type.startsWith('image/')) {
                this.processImageFile(file, index, files.length);
            }
        });
    }

    processImageFile(file, index, total) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.canvas.width = img.width;
                this.canvas.height = img.height;
                this.ctx.drawImage(img, 0, 0);
                
                this.processImage(this.canvas, `ファイル ${index + 1}: ${file.name}`);
                
                const progress = ((index + 1) / total) * 100;
                this.updateProgress(progress);
                
                if (index === total - 1) {
                    this.updateStatus('ファイル処理完了');
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    processImage(canvas, source = 'カメラ') {
        const imageData = this.ctx.getImageData(0, 0, canvas.width, canvas.height);
        const qrCodes = this.detectMultipleQRCodes(imageData);
        
        if (qrCodes.length > 0) {
            this.displayResults(qrCodes, source);
            this.updateStatus(`${qrCodes.length}個のQRコードが見つかりました`);
        } else if (source !== 'カメラ') {
            this.updateStatus('QRコードが見つかりませんでした');
        }
    }

    processImageQuick(canvas) {
        // Lighter processing for real-time scanning
        const imageData = this.ctx.getImageData(0, 0, canvas.width, canvas.height);
        const qrCodes = this.detectMultipleQRCodes(imageData);
        
        if (qrCodes.length > 0) {
            this.displayResults(qrCodes, 'リアルタイム');
        }
    }

    detectMultipleQRCodes(imageData) {
        const qrCodes = [];
        
        // Try to detect QR codes in the full image first
        try {
            const qrCode = jsQR(imageData.data, imageData.width, imageData.height);
            if (qrCode) {
                qrCodes.push({
                    data: qrCode.data,
                    location: qrCode.location,
                    region: 'full'
                });
            }
        } catch (error) {
            console.error('QR detection error:', error);
        }

        // Try to detect QR codes in different regions of the image
        const regions = this.getImageRegions(imageData);
        regions.forEach((region, index) => {
            try {
                const qrCode = jsQR(region.data, region.width, region.height);
                if (qrCode) {
                    // Check if this QR code is already found
                    const exists = qrCodes.some(existing => existing.data === qrCode.data);
                    if (!exists) {
                        qrCodes.push({
                            data: qrCode.data,
                            location: qrCode.location,
                            region: `region-${index}`,
                            regionInfo: region.info
                        });
                    }
                }
            } catch (error) {
                console.error(`QR detection error in region ${index}:`, error);
            }
        });

        return qrCodes;
    }

    getImageRegions(imageData) {
        const regions = [];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Divide image into quadrants
        const halfWidth = Math.floor(imageData.width / 2);
        const halfHeight = Math.floor(imageData.height / 2);
        
        const quadrants = [
            { x: 0, y: 0, width: halfWidth, height: halfHeight, name: '左上' },
            { x: halfWidth, y: 0, width: halfWidth, height: halfHeight, name: '右上' },
            { x: 0, y: halfHeight, width: halfWidth, height: halfHeight, name: '左下' },
            { x: halfWidth, y: halfHeight, width: halfWidth, height: halfHeight, name: '右下' }
        ];

        quadrants.forEach(quad => {
            canvas.width = quad.width;
            canvas.height = quad.height;
            
            // Create temporary canvas to extract the region
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = imageData.width;
            tempCanvas.height = imageData.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.putImageData(imageData, 0, 0);
            
            // Draw the specific region
            ctx.drawImage(
                tempCanvas, 
                quad.x, quad.y, quad.width, quad.height,
                0, 0, quad.width, quad.height
            );
            
            const regionImageData = ctx.getImageData(0, 0, quad.width, quad.height);
            regions.push({
                data: regionImageData.data,
                width: quad.width,
                height: quad.height,
                info: quad.name
            });
        });

        return regions;
    }

    displayResults(qrCodes, source) {
        if (source === 'リアルタイム') {
            // For real-time, only update if we have new results
            const existingResults = this.resultsContainer.querySelectorAll('.qr-result');
            if (existingResults.length > 0) {
                const existingData = Array.from(existingResults).map(el => 
                    el.querySelector('.qr-data').textContent
                );
                const newData = qrCodes.map(qr => qr.data);
                
                // Only update if results are different
                if (JSON.stringify(existingData.sort()) === JSON.stringify(newData.sort())) {
                    return;
                }
            }
        }

        this.clearResults();
        
        qrCodes.forEach((qrCode, index) => {
            const resultElement = document.createElement('div');
            resultElement.className = 'qr-result';
            
            resultElement.innerHTML = `
                <h3>QRコード ${index + 1}</h3>
                <div class="qr-data">${this.escapeHtml(qrCode.data)}</div>
                <div class="qr-position">
                    検出位置: ${qrCode.regionInfo || qrCode.region || 'フル画像'}<br>
                    ソース: ${source}<br>
                    座標: (${qrCode.location?.topLeftCorner?.x || 'N/A'}, ${qrCode.location?.topLeftCorner?.y || 'N/A'})
                </div>
            `;
            
            this.resultsContainer.appendChild(resultElement);
        });
    }

    clearResults() {
        this.resultsContainer.innerHTML = '';
    }

    showError(message) {
        const errorElement = document.createElement('div');
        errorElement.className = 'error';
        errorElement.textContent = message;
        this.resultsContainer.appendChild(errorElement);
    }

    updateStatus(message) {
        this.statusElement.textContent = message;
    }

    updateProgress(percentage) {
        this.progressBar.style.width = `${percentage}%`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new MultipleQRReader();
});