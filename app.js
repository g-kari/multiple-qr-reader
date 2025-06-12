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
        
        // Performance tracking for adaptive scanning
        this.lastScanTime = 0;
        this.scanPerformanceHistory = [];
        this.currentScanInterval = 200; // Default interval
        
        // Initialize WebAssembly and YOLO modules
        this.wasmProcessor = new WasmImageProcessor();
        this.yoloDetector = new YOLOQRDetector();
        
        this.initializeEventListeners();
        this.initializeModules();
    }

    async initializeModules() {
        this.updateStatus('モジュールを初期化しています...');
        this.updateProgress(25);
        
        try {
            const wasmReady = await this.wasmProcessor.isReady();
            this.updateProgress(50);
            
            if (wasmReady) {
                this.updateStatus('WebAssembly モジュールが準備できました');
            } else {
                this.updateStatus('WebAssembly フォールバックモードで動作します');
            }
            
            this.updateProgress(100);
            
            setTimeout(() => {
                this.updateStatus('準備完了 - WebAssembly & YOLO 対応');
                this.updateProgress(0);
            }, 1000);
            
        } catch (error) {
            console.error('Module initialization error:', error);
            this.updateStatus('基本モードで準備完了');
            this.updateProgress(0);
        }
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

            // Detect device type for optimized camera settings
            const isAndroid = /Android/i.test(navigator.userAgent);
            const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            // Optimize camera constraints for mobile devices
            let videoConstraints = {
                facingMode: 'environment'
            };
            
            if (isAndroid) {
                // Android-optimized settings for better performance
                videoConstraints.width = { ideal: 1280, max: 1920 };
                videoConstraints.height = { ideal: 720, max: 1080 };
                videoConstraints.frameRate = { ideal: 30, max: 30 };
            } else if (isMobile) {
                // Other mobile devices
                videoConstraints.width = { ideal: 1280 };
                videoConstraints.height = { ideal: 720 };
                videoConstraints.frameRate = { ideal: 30 };
            } else {
                // Desktop settings
                videoConstraints.width = { ideal: 1280 };
                videoConstraints.height = { ideal: 720 };
            }

            this.stream = await navigator.mediaDevices.getUserMedia({
                video: videoConstraints
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
        
        // Detect device type and adjust scanning interval accordingly
        const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const isAndroid = /Android/i.test(navigator.userAgent);
        
        // Use faster scanning for better real-time experience
        // Android devices get optimized settings
        let scanInterval = 200; // Default 200ms for better real-time feel
        
        if (isAndroid) {
            // Slightly slower on Android to maintain performance
            scanInterval = 250;
        } else if (isMobile) {
            // Other mobile devices
            scanInterval = 300;
        }
        
        this.scanInterval = setInterval(() => {
            this.scanVideoFrame();
        }, scanInterval);
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

        const startTime = performance.now();
        
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        this.ctx.drawImage(this.video, 0, 0);
        
        // Process frame for QR codes (lighter processing for real-time)
        this.processImageQuick(this.canvas).then(() => {
            // Track performance for adaptive scanning
            const scanDuration = performance.now() - startTime;
            this.trackScanPerformance(scanDuration);
        }).catch(error => {
            console.error('Scan frame error:', error);
        });
    }
    
    trackScanPerformance(duration) {
        // Keep track of recent scan performance
        this.scanPerformanceHistory.push(duration);
        
        // Keep only the last 10 measurements
        if (this.scanPerformanceHistory.length > 10) {
            this.scanPerformanceHistory.shift();
        }
        
        // If performance is consistently slow on mobile, adapt the scanning strategy
        if (this.scanPerformanceHistory.length >= 5) {
            const avgDuration = this.scanPerformanceHistory.reduce((a, b) => a + b, 0) / this.scanPerformanceHistory.length;
            const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            // If scans are taking too long on mobile (>100ms), we need to optimize further
            if (isMobile && avgDuration > 100) {
                console.log(`Performance warning: Average scan time ${avgDuration.toFixed(1)}ms`);
                // This could trigger further optimizations in the future
            }
        }
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

    async processImage(canvas, source = 'カメラ') {
        const imageData = this.ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Use YOLO detection to find QR code regions
        this.updateStatus('YOLO でQRコード領域を検出中...');
        const regions = await this.yoloDetector.detectQRRegions(imageData);
        
        if (regions.length > 0) {
            this.updateStatus(`${regions.length}個の候補領域が見つかりました。QRコードを解析中...`);
            
            const qrCodes = [];
            
            // Process each detected region
            for (let i = 0; i < regions.length; i++) {
                const region = regions[i];
                const regionImageData = this.yoloDetector.extractRegion(imageData, region);
                
                // Apply WebAssembly image processing for better detection
                const processedImageData = await this.wasmProcessor.convertToGrayscale(regionImageData);
                const enhancedImageData = this.wasmProcessor.enhanceContrast(processedImageData, 1.3);
                
                // Try to detect QR codes in this region
                try {
                    const qrCode = jsQR(enhancedImageData.data, enhancedImageData.width, enhancedImageData.height);
                    if (qrCode) {
                        // Adjust coordinates to full image
                        const adjustedLocation = this.adjustLocationToFullImage(qrCode.location, region);
                        
                        qrCodes.push({
                            data: qrCode.data,
                            location: adjustedLocation,
                            region: `YOLO-Region-${i}`,
                            regionInfo: `信頼度: ${(region.confidence * 100).toFixed(1)}%`,
                            confidence: region.confidence
                        });
                    }
                } catch (error) {
                    console.error(`QR detection error in region ${i}:`, error);
                }
                
                this.updateProgress((i + 1) / regions.length * 100);
            }
            
            // Also try full image detection as fallback
            const fullImageQR = this.detectMultipleQRCodes(imageData);
            fullImageQR.forEach(qr => {
                const exists = qrCodes.some(existing => existing.data === qr.data);
                if (!exists) {
                    qrCodes.push(qr);
                }
            });
            
            if (qrCodes.length > 0) {
                this.displayResults(qrCodes, source);
                this.updateStatus(`${qrCodes.length}個のQRコードが見つかりました (YOLO + WebAssembly)`);
            } else {
                this.updateStatus('QRコードが見つかりませんでした');
            }
        } else {
            // Fallback to traditional detection
            const qrCodes = this.detectMultipleQRCodes(imageData);
            if (qrCodes.length > 0) {
                this.displayResults(qrCodes, source);
                this.updateStatus(`${qrCodes.length}個のQRコードが見つかりました (従来方式)`);
            } else if (source !== 'カメラ') {
                this.updateStatus('QRコードが見つかりませんでした');
            }
        }
        
        this.updateProgress(100);
        setTimeout(() => this.updateProgress(0), 1000);
    }

    adjustLocationToFullImage(location, region) {
        if (!location) return null;
        
        return {
            topLeftCorner: {
                x: location.topLeftCorner.x + region.x,
                y: location.topLeftCorner.y + region.y
            },
            topRightCorner: {
                x: location.topRightCorner.x + region.x,
                y: location.topRightCorner.y + region.y
            },
            bottomLeftCorner: {
                x: location.bottomLeftCorner.x + region.x,
                y: location.bottomLeftCorner.y + region.y
            },
            bottomRightCorner: {
                x: location.bottomRightCorner.x + region.x,
                y: location.bottomRightCorner.y + region.y
            }
        };
    }

    async processImageQuick(canvas) {
        // Lighter processing for real-time scanning
        const imageData = this.ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Detect device type for performance optimization
        const isAndroid = /Android/i.test(navigator.userAgent);
        const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        let qrCodes = [];
        
        if (isMobile) {
            // For mobile devices, use simpler detection first
            try {
                // Try direct detection on full image first (fastest method)
                const qrCode = jsQR(imageData.data, imageData.width, imageData.height);
                if (qrCode) {
                    qrCodes.push({
                        data: qrCode.data,
                        location: qrCode.location,
                        region: 'full-リアルタイム',
                        regionInfo: 'ダイレクト検出',
                        confidence: 1.0
                    });
                }
            } catch (error) {
                console.error('Direct QR detection error:', error);
            }
            
            // If no QR found and this is not Android, try simplified region detection
            if (qrCodes.length === 0 && !isAndroid) {
                const regions = this.getImageRegions(imageData, true); // Get fewer regions for mobile
                for (let i = 0; i < Math.min(regions.length, 2); i++) { // Process max 2 regions
                    try {
                        const region = regions[i];
                        const qrCode = jsQR(region.data, region.width, region.height);
                        if (qrCode) {
                            qrCodes.push({
                                data: qrCode.data,
                                location: qrCode.location,
                                region: `region-${i}-リアルタイム`,
                                regionInfo: '領域検出',
                                confidence: 0.8
                            });
                            break; // Found one, stop processing more regions
                        }
                    } catch (error) {
                        console.error(`Region QR detection error ${i}:`, error);
                    }
                }
            }
        } else {
            // For desktop, use YOLO detection as before
            const regions = await this.yoloDetector.detectQRRegions(imageData);
            
            if (regions.length > 0) {
                // Process only the most confident regions for real-time
                const topRegions = regions
                    .sort((a, b) => b.confidence - a.confidence)
                    .slice(0, 3); // Process top 3 regions only
                
                for (const region of topRegions) {
                    const regionImageData = this.yoloDetector.extractRegion(imageData, region);
                    
                    try {
                        const qrCode = jsQR(regionImageData.data, regionImageData.width, regionImageData.height);
                        if (qrCode) {
                            const adjustedLocation = this.adjustLocationToFullImage(qrCode.location, region);
                            qrCodes.push({
                                data: qrCode.data,
                                location: adjustedLocation,
                                region: 'YOLO-リアルタイム',
                                regionInfo: `信頼度: ${(region.confidence * 100).toFixed(1)}%`,
                                confidence: region.confidence
                            });
                        }
                    } catch (error) {
                        console.error('Real-time QR detection error:', error);
                    }
                }
            } else {
                // Fallback to traditional quick detection
                const qrCodesTraditional = this.detectMultipleQRCodes(imageData);
                if (qrCodesTraditional.length > 0) {
                    qrCodes = qrCodesTraditional;
                }
            }
        }
        
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

    getImageRegions(imageData, simplifiedForMobile = false) {
        const regions = [];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Divide image into quadrants (or just center regions for mobile)
        let quadrants;
        
        if (simplifiedForMobile) {
            // For mobile, only process center and top regions for better performance
            const centerX = Math.floor(imageData.width * 0.25);
            const centerY = Math.floor(imageData.height * 0.25);
            const centerWidth = Math.floor(imageData.width * 0.5);
            const centerHeight = Math.floor(imageData.height * 0.5);
            
            quadrants = [
                { x: centerX, y: centerY, width: centerWidth, height: centerHeight, name: '中央' },
                { x: 0, y: 0, width: imageData.width, height: Math.floor(imageData.height * 0.5), name: '上半分' }
            ];
        } else {
            // Full quadrant processing for desktop
            const halfWidth = Math.floor(imageData.width / 2);
            const halfHeight = Math.floor(imageData.height / 2);
            
            quadrants = [
                { x: 0, y: 0, width: halfWidth, height: halfHeight, name: '左上' },
                { x: halfWidth, y: 0, width: halfWidth, height: halfHeight, name: '右上' },
                { x: 0, y: halfHeight, width: halfWidth, height: halfHeight, name: '左下' },
                { x: halfWidth, y: halfHeight, width: halfWidth, height: halfHeight, name: '右下' }
            ];
        }

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
            
            // Add confidence indicator if available
            const confidenceInfo = qrCode.confidence ? 
                `<div class="confidence-indicator">
                    <span class="confidence-label">信頼度:</span>
                    <div class="confidence-bar">
                        <div class="confidence-fill" style="width: ${qrCode.confidence * 100}%"></div>
                    </div>
                    <span class="confidence-value">${(qrCode.confidence * 100).toFixed(1)}%</span>
                </div>` : '';
            
            resultElement.innerHTML = `
                <h3>QRコード ${index + 1}</h3>
                <div class="qr-data">${this.escapeHtml(qrCode.data)}</div>
                ${confidenceInfo}
                <div class="qr-position">
                    検出方式: ${qrCode.regionInfo || qrCode.region || 'フル画像'}<br>
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