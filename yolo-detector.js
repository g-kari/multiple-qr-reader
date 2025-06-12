// YOLO-inspired object detection for QR codes
class YOLOQRDetector {
    constructor() {
        this.modelLoaded = false;
        this.gridSize = 7; // 7x7 grid similar to YOLO v1
        this.confidenceThreshold = 0.3;
        this.nmsThreshold = 0.4;
        
        // Simple pattern-based detection (in real implementation, this would be a trained neural network)
        this.initializePatternDetector();
    }

    initializePatternDetector() {
        // QR code pattern detection using Haar-like features
        this.finderPatterns = [
            // Top-left finder pattern (simplified)
            [
                [1, 1, 1, 1, 1, 1, 1],
                [1, 0, 0, 0, 0, 0, 1],
                [1, 0, 1, 1, 1, 0, 1],
                [1, 0, 1, 1, 1, 0, 1],
                [1, 0, 1, 1, 1, 0, 1],
                [1, 0, 0, 0, 0, 0, 1],
                [1, 1, 1, 1, 1, 1, 1]
            ]
        ];
        
        this.modelLoaded = true;
    }

    // Main detection function
    async detectQRRegions(imageData) {
        if (!this.modelLoaded) {
            console.warn('YOLO model not loaded, using fallback detection');
            return this.fallbackDetection(imageData);
        }

        const regions = [];
        const width = imageData.width;
        const height = imageData.height;
        
        // Convert to grayscale for processing
        const grayData = this.convertToGrayscale(imageData);
        
        // Divide image into grid cells
        const cellWidth = Math.floor(width / this.gridSize);
        const cellHeight = Math.floor(height / this.gridSize);
        
        for (let gridY = 0; gridY < this.gridSize; gridY++) {
            for (let gridX = 0; gridX < this.gridSize; gridX++) {
                const startX = gridX * cellWidth;
                const startY = gridY * cellHeight;
                
                // Extract cell data
                const cellData = this.extractCell(grayData, startX, startY, cellWidth, cellHeight, width);
                
                // Detect QR patterns in this cell
                const detections = this.detectPatternsInCell(cellData, cellWidth, cellHeight);
                
                // Convert cell-relative coordinates to image coordinates
                detections.forEach(detection => {
                    regions.push({
                        x: startX + detection.x,
                        y: startY + detection.y,
                        width: detection.width,
                        height: detection.height,
                        confidence: detection.confidence,
                        type: 'qr_candidate'
                    });
                });
            }
        }

        // Apply Non-Maximum Suppression
        const filteredRegions = this.applyNMS(regions);
        
        // Expand regions for better QR detection
        return this.expandRegions(filteredRegions, width, height);
    }

    convertToGrayscale(imageData) {
        const data = imageData.data;
        const grayData = new Uint8Array(imageData.width * imageData.height);
        
        for (let i = 0; i < data.length; i += 4) {
            const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            grayData[i / 4] = gray;
        }
        
        return grayData;
    }

    extractCell(grayData, startX, startY, cellWidth, cellHeight, imageWidth) {
        const cellData = new Uint8Array(cellWidth * cellHeight);
        
        for (let y = 0; y < cellHeight; y++) {
            for (let x = 0; x < cellWidth; x++) {
                const srcIndex = (startY + y) * imageWidth + (startX + x);
                const dstIndex = y * cellWidth + x;
                cellData[dstIndex] = grayData[srcIndex] || 0;
            }
        }
        
        return cellData;
    }

    detectPatternsInCell(cellData, cellWidth, cellHeight) {
        const detections = [];
        const minSize = Math.min(cellWidth, cellHeight);
        
        // Look for QR code patterns at different scales
        const scales = [0.1, 0.2, 0.3, 0.5, 0.7, 1.0];
        
        scales.forEach(scale => {
            const patternSize = Math.floor(minSize * scale);
            if (patternSize < 21) return; // QR codes are at least 21x21
            
            const stepSize = Math.max(1, Math.floor(patternSize * 0.1));
            
            for (let y = 0; y <= cellHeight - patternSize; y += stepSize) {
                for (let x = 0; x <= cellWidth - patternSize; x += stepSize) {
                    const confidence = this.evaluateQRPattern(cellData, x, y, patternSize, cellWidth);
                    
                    if (confidence > this.confidenceThreshold) {
                        detections.push({
                            x: x,
                            y: y,
                            width: patternSize,
                            height: patternSize,
                            confidence: confidence
                        });
                    }
                }
            }
        });
        
        return detections;
    }

    evaluateQRPattern(cellData, startX, startY, size, cellWidth) {
        // Simplified QR pattern evaluation
        let score = 0;
        let totalChecks = 0;
        
        // Check for finder patterns (corners)
        const finderSize = Math.floor(size * 0.14); // Finder patterns are ~1/7 of QR size
        
        if (finderSize < 3) return 0;
        
        // Check top-left finder pattern
        score += this.checkFinderPattern(cellData, startX, startY, finderSize, cellWidth);
        totalChecks++;
        
        // Check top-right finder pattern
        score += this.checkFinderPattern(cellData, startX + size - finderSize, startY, finderSize, cellWidth);
        totalChecks++;
        
        // Check bottom-left finder pattern
        score += this.checkFinderPattern(cellData, startX, startY + size - finderSize, finderSize, cellWidth);
        totalChecks++;
        
        // Check for quiet zone (should be light)
        const quietZoneScore = this.checkQuietZone(cellData, startX, startY, size, cellWidth);
        score += quietZoneScore;
        totalChecks++;
        
        // Check for data patterns (should have variation)
        const dataVariation = this.checkDataVariation(cellData, startX, startY, size, cellWidth);
        score += dataVariation;
        totalChecks++;
        
        return score / totalChecks;
    }

    checkFinderPattern(cellData, startX, startY, size, cellWidth) {
        if (size < 7) return 0;
        
        let score = 0;
        let checks = 0;
        
        // Check the characteristic finder pattern ratios (1:1:3:1:1)
        const unit = Math.floor(size / 7);
        
        // Horizontal scan through middle
        const midY = startY + Math.floor(size / 2);
        if (midY >= 0) {
            for (let x = 0; x < size; x += unit) {
                const idx = midY * cellWidth + startX + x;
                if (idx < cellData.length) {
                    const brightness = cellData[idx];
                    const expected = this.getExpectedFinderValue(x, size);
                    const diff = Math.abs(brightness - expected) / 255;
                    score += 1 - diff;
                    checks++;
                }
            }
        }
        
        // Vertical scan through middle
        const midX = startX + Math.floor(size / 2);
        if (midX >= 0) {
            for (let y = 0; y < size; y += unit) {
                const idx = (startY + y) * cellWidth + midX;
                if (idx < cellData.length) {
                    const brightness = cellData[idx];
                    const expected = this.getExpectedFinderValue(y, size);
                    const diff = Math.abs(brightness - expected) / 255;
                    score += 1 - diff;
                    checks++;
                }
            }
        }
        
        return checks > 0 ? score / checks : 0;
    }

    getExpectedFinderValue(position, size) {
        const unit = size / 7;
        const pos = position / unit;
        
        // Finder pattern: dark-light-dark-light-dark (1:1:3:1:1 ratio)
        if (pos < 1 || pos >= 6) return 0;   // Dark border
        if (pos >= 1 && pos < 2) return 255; // Light
        if (pos >= 2 && pos < 5) return 0;   // Dark center (3 units)
        if (pos >= 5 && pos < 6) return 255; // Light
        
        return 128; // Default gray
    }

    checkQuietZone(cellData, startX, startY, size, cellWidth) {
        // QR codes should have a light "quiet zone" around them
        let lightCount = 0;
        let totalCount = 0;
        const border = Math.max(1, Math.floor(size * 0.05));
        
        // Check top border
        for (let x = Math.max(0, startX - border); x < Math.min(cellWidth, startX + size + border); x++) {
            for (let y = Math.max(0, startY - border); y < startY; y++) {
                const idx = y * cellWidth + x;
                if (idx < cellData.length) {
                    if (cellData[idx] > 128) lightCount++;
                    totalCount++;
                }
            }
        }
        
        return totalCount > 0 ? lightCount / totalCount : 0;
    }

    checkDataVariation(cellData, startX, startY, size, cellWidth) {
        // QR codes should have good variation in the data area
        let variance = 0;
        let mean = 0;
        let count = 0;
        
        const dataStart = Math.floor(size * 0.2);
        const dataEnd = Math.floor(size * 0.8);
        
        // Calculate mean
        for (let y = dataStart; y < dataEnd; y += 2) {
            for (let x = dataStart; x < dataEnd; x += 2) {
                const idx = (startY + y) * cellWidth + (startX + x);
                if (idx < cellData.length) {
                    mean += cellData[idx];
                    count++;
                }
            }
        }
        
        if (count === 0) return 0;
        mean /= count;
        
        // Calculate variance
        for (let y = dataStart; y < dataEnd; y += 2) {
            for (let x = dataStart; x < dataEnd; x += 2) {
                const idx = (startY + y) * cellWidth + (startX + x);
                if (idx < cellData.length) {
                    const diff = cellData[idx] - mean;
                    variance += diff * diff;
                }
            }
        }
        
        variance /= count;
        
        // Normalize variance to 0-1 range
        return Math.min(1, variance / (128 * 128));
    }

    applyNMS(regions) {
        // Non-Maximum Suppression to remove overlapping detections
        const sorted = regions.sort((a, b) => b.confidence - a.confidence);
        const kept = [];
        
        for (let i = 0; i < sorted.length; i++) {
            const current = sorted[i];
            let keep = true;
            
            for (let j = 0; j < kept.length; j++) {
                const overlap = this.calculateIoU(current, kept[j]);
                if (overlap > this.nmsThreshold) {
                    keep = false;
                    break;
                }
            }
            
            if (keep) {
                kept.push(current);
            }
        }
        
        return kept;
    }

    calculateIoU(box1, box2) {
        // Intersection over Union
        const x1 = Math.max(box1.x, box2.x);
        const y1 = Math.max(box1.y, box2.y);
        const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
        const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);
        
        if (x2 <= x1 || y2 <= y1) return 0;
        
        const intersection = (x2 - x1) * (y2 - y1);
        const area1 = box1.width * box1.height;
        const area2 = box2.width * box2.height;
        const union = area1 + area2 - intersection;
        
        return intersection / union;
    }

    expandRegions(regions, imageWidth, imageHeight) {
        // Expand detected regions to ensure full QR code coverage
        return regions.map(region => {
            const expansion = Math.floor(Math.min(region.width, region.height) * 0.1);
            
            return {
                x: Math.max(0, region.x - expansion),
                y: Math.max(0, region.y - expansion),
                width: Math.min(imageWidth - region.x + expansion, region.width + 2 * expansion),
                height: Math.min(imageHeight - region.y + expansion, region.height + 2 * expansion),
                confidence: region.confidence,
                type: region.type
            };
        });
    }

    fallbackDetection(imageData) {
        // Simple fallback: divide image into overlapping regions
        const regions = [];
        const width = imageData.width;
        const height = imageData.height;
        
        const regionSize = Math.min(width, height) / 3;
        const overlap = regionSize * 0.2;
        
        for (let y = 0; y < height - regionSize; y += regionSize - overlap) {
            for (let x = 0; x < width - regionSize; x += regionSize - overlap) {
                regions.push({
                    x: Math.floor(x),
                    y: Math.floor(y),
                    width: Math.floor(regionSize),
                    height: Math.floor(regionSize),
                    confidence: 0.5,
                    type: 'fallback_region'
                });
            }
        }
        
        return regions;
    }

    // Extract image data for a specific region
    extractRegion(imageData, region) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = region.width;
        canvas.height = region.height;
        
        // Create temporary canvas with full image
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imageData.width;
        tempCanvas.height = imageData.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.putImageData(imageData, 0, 0);
        
        // Extract the region
        ctx.drawImage(
            tempCanvas,
            region.x, region.y, region.width, region.height,
            0, 0, region.width, region.height
        );
        
        return ctx.getImageData(0, 0, region.width, region.height);
    }
}

// Export for use in main application
window.YOLOQRDetector = YOLOQRDetector;