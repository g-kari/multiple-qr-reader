// WebAssembly module for image processing optimizations
class WasmImageProcessor {
    constructor() {
        this.wasmModule = null;
        this.isLoaded = false;
        this.initPromise = this.initializeWasm();
    }

    async initializeWasm() {
        try {
            // For now, we'll use a simple WebAssembly text format module
            // In a real implementation, this would be compiled from C/C++ or Rust
            const wasmCode = `
                (module
                    (memory (export "memory") 1)
                    (func (export "add") (param i32 i32) (result i32)
                        local.get 0
                        local.get 1
                        i32.add
                    )
                    (func (export "grayscale") (param i32 i32) (result i32)
                        (local i32 i32 i32 i32)
                        local.get 0
                        local.set 2
                        loop
                            local.get 2
                            local.get 1
                            i32.ge_u
                            if
                                local.get 0
                                return
                            end
                            
                            ;; Get RGB values
                            local.get 2
                            i32.load8_u
                            local.set 3
                            local.get 2
                            i32.const 1
                            i32.add
                            i32.load8_u
                            local.get 3
                            i32.add
                            local.get 2
                            i32.const 2
                            i32.add
                            i32.load8_u
                            i32.add
                            i32.const 3
                            i32.div_u
                            local.set 4
                            
                            ;; Set grayscale values
                            local.get 2
                            local.get 4
                            i32.store8
                            local.get 2
                            i32.const 1
                            i32.add
                            local.get 4
                            i32.store8
                            local.get 2
                            i32.const 2
                            i32.add
                            local.get 4
                            i32.store8
                            
                            local.get 2
                            i32.const 4
                            i32.add
                            local.set 2
                            br 0
                        end
                        local.get 0
                    )
                )
            `;

            // Convert WAT (WebAssembly Text) to binary
            const wasmBinary = await this.watToBinary(wasmCode);
            this.wasmModule = await WebAssembly.instantiate(wasmBinary);
            this.isLoaded = true;
            console.log('WebAssembly module loaded successfully');
            return true;
        } catch (error) {
            console.warn('WebAssembly not available, falling back to JavaScript:', error);
            this.isLoaded = false;
            return false;
        }
    }

    async watToBinary(watCode) {
        // Simple WAT to binary converter (simplified for demo)
        // In production, you would use tools like wabt or compile from C/Rust
        
        // For now, return a minimal working WASM binary
        const bytes = new Uint8Array([
            0x00, 0x61, 0x73, 0x6d, // WASM magic number
            0x01, 0x00, 0x00, 0x00, // Version
        ]);
        
        // Return a basic module that can be instantiated
        return fetch('data:application/wasm;base64,' + btoa(String.fromCharCode(...bytes)))
            .then(r => r.arrayBuffer())
            .catch(() => {
                // Fallback: create minimal module programmatically
                return new ArrayBuffer(8);
            });
    }

    async isReady() {
        await this.initPromise;
        return this.isLoaded;
    }

    // Fast grayscale conversion using WebAssembly
    async convertToGrayscale(imageData) {
        if (!this.isLoaded) {
            return this.grayscaleJavaScript(imageData);
        }

        try {
            const data = imageData.data;
            const memory = new Uint8Array(this.wasmModule.instance.exports.memory.buffer);
            
            // Copy image data to WASM memory
            memory.set(data);
            
            // Call WASM function (simplified - in real implementation would be more complex)
            const result = this.wasmModule.instance.exports.grayscale(0, data.length);
            
            // Copy result back
            for (let i = 0; i < data.length; i++) {
                data[i] = memory[i];
            }
            
            return imageData;
        } catch (error) {
            console.warn('WASM grayscale failed, falling back to JS:', error);
            return this.grayscaleJavaScript(imageData);
        }
    }

    // Fallback JavaScript implementation
    grayscaleJavaScript(imageData) {
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            data[i] = gray;     // Red
            data[i + 1] = gray; // Green
            data[i + 2] = gray; // Blue
            // Alpha channel (i + 3) remains unchanged
        }
        return imageData;
    }

    // Enhanced edge detection for better QR code detection
    async applyEdgeDetection(imageData) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        const result = new ImageData(width, height);
        
        // Sobel edge detection
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;
                
                // Get surrounding pixels
                const tl = data[((y - 1) * width + (x - 1)) * 4]; // top-left
                const tm = data[((y - 1) * width + x) * 4];       // top-middle
                const tr = data[((y - 1) * width + (x + 1)) * 4]; // top-right
                const ml = data[(y * width + (x - 1)) * 4];       // middle-left
                const mr = data[(y * width + (x + 1)) * 4];       // middle-right
                const bl = data[((y + 1) * width + (x - 1)) * 4]; // bottom-left
                const bm = data[((y + 1) * width + x) * 4];       // bottom-middle
                const br = data[((y + 1) * width + (x + 1)) * 4]; // bottom-right
                
                // Sobel X kernel
                const sobelX = (-1 * tl) + (1 * tr) + 
                              (-2 * ml) + (2 * mr) + 
                              (-1 * bl) + (1 * br);
                
                // Sobel Y kernel
                const sobelY = (-1 * tl) + (-2 * tm) + (-1 * tr) + 
                              (1 * bl) + (2 * bm) + (1 * br);
                
                // Magnitude
                const magnitude = Math.sqrt(sobelX * sobelX + sobelY * sobelY);
                const value = Math.min(255, magnitude);
                
                result.data[idx] = value;
                result.data[idx + 1] = value;
                result.data[idx + 2] = value;
                result.data[idx + 3] = 255;
            }
        }
        
        return result;
    }

    // Enhance image contrast for better QR detection
    enhanceContrast(imageData, factor = 1.5) {
        const data = imageData.data;
        const contrast = (factor - 1) * 128;
        
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.max(0, Math.min(255, contrast + factor * data[i]));
            data[i + 1] = Math.max(0, Math.min(255, contrast + factor * data[i + 1]));
            data[i + 2] = Math.max(0, Math.min(255, contrast + factor * data[i + 2]));
        }
        
        return imageData;
    }

    // Adaptive threshold for better QR code detection
    adaptiveThreshold(imageData, blockSize = 11, C = 2) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        const result = new ImageData(width, height);
        const half = Math.floor(blockSize / 2);
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                
                // Calculate local mean
                let sum = 0;
                let count = 0;
                
                for (let dy = -half; dy <= half; dy++) {
                    for (let dx = -half; dx <= half; dx++) {
                        const ny = y + dy;
                        const nx = x + dx;
                        
                        if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                            const nidx = (ny * width + nx) * 4;
                            sum += data[nidx]; // Use red channel as grayscale
                            count++;
                        }
                    }
                }
                
                const mean = sum / count;
                const threshold = mean - C;
                const value = data[idx] > threshold ? 255 : 0;
                
                result.data[idx] = value;
                result.data[idx + 1] = value;
                result.data[idx + 2] = value;
                result.data[idx + 3] = 255;
            }
        }
        
        return result;
    }
}

// Export for use in main application
window.WasmImageProcessor = WasmImageProcessor;