/**
 * Image Compression Utilities
 * 
 * Compress images (especially signatures) to reduce file size and upload time
 */

/**
 * Compress a base64 image string
 * @param {string} base64 - Base64 encoded image (with data:image/png;base64, prefix)
 * @param {object} options - Compression options
 * @param {number} options.maxWidth - Maximum width (default: 800)
 * @param {number} options.maxHeight - Maximum height (default: 400)
 * @param {number} options.quality - JPEG quality 0-1 (default: 0.8)
 * @param {string} options.outputFormat - Output format 'image/jpeg' or 'image/png' (default: 'image/jpeg')
 * @returns {Promise<string>} Compressed base64 image
 */
export const compressBase64Image = (
  base64,
  { maxWidth = 800, maxHeight = 400, quality = 0.8, outputFormat = 'image/jpeg' } = {}
) => {
  return new Promise((resolve, reject) => {
    if (!base64) {
      reject(new Error('No image data provided'));
      return;
    }

    const img = new Image();
    img.onload = () => {
      try {
        // Calculate dimensions maintaining aspect ratio
        let { width, height } = img;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }

        // Create canvas and draw resized image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Use high-quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Draw white background for JPEG (transparent pixels become black otherwise)
        if (outputFormat === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
        }
        
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to compressed format
        const compressed = canvas.toDataURL(outputFormat, quality);
        resolve(compressed);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    img.src = base64;
  });
};

/**
 * Get the file size of a base64 string in bytes
 * @param {string} base64 - Base64 string
 * @returns {number} Size in bytes
 */
export const getBase64Size = (base64) => {
  if (!base64) return 0;
  
  // Remove data URL prefix
  const base64Data = base64.split(',')[1] || base64;
  
  // Calculate size (base64 is ~33% larger than binary)
  const padding = (base64Data.match(/=/g) || []).length;
  return (base64Data.length * 3) / 4 - padding;
};

/**
 * Convert bytes to human-readable string
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string
 */
export const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

/**
 * Compress signature canvas to optimal size for storage
 * @param {string} base64 - Signature canvas data URL
 * @returns {Promise<string>} Compressed signature
 */
export const compressSignature = async (base64) => {
  const originalSize = getBase64Size(base64);
  
  // Signatures don't need high resolution
  const compressed = await compressBase64Image(base64, {
    maxWidth: 600,
    maxHeight: 200,
    quality: 0.85,
    outputFormat: 'image/jpeg',
  });
  
  const compressedSize = getBase64Size(compressed);
  const reductionPercent = ((1 - compressedSize / originalSize) * 100).toFixed(1);
  
  // Log compression results for debugging (development only)
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log(`Signature compressed: ${formatBytes(originalSize)} → ${formatBytes(compressedSize)} (${reductionPercent}% reduction)`);
  }
  
  return compressed;
};

export default {
  compressBase64Image,
  compressSignature,
  getBase64Size,
  formatBytes,
};
