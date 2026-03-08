// Shared image utilities
// Single source of truth for common image helpers used across the codebase.

/**
 * Convert a format string (e.g. 'png', 'jpg', 'webp') to a proper MIME type.
 */
export function formatToMimeType(format: string): string {
    switch (format.toLowerCase()) {
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        case 'webp':
            return 'image/webp';
        case 'png':
        default:
            return 'image/png';
    }
}

/**
 * Convert a base64 string (raw or data URL) to a data URL.
 */
export function toDataUrl(base64Data: string, mimeType: string = 'image/png'): string {
    return base64Data.startsWith('data:')
        ? base64Data
        : `data:${mimeType};base64,${base64Data}`;
}

/**
 * Load a base64 image (raw or data URL) into an HTMLImageElement.
 */
export function loadImage(base64Data: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = toDataUrl(base64Data);
    });
}
