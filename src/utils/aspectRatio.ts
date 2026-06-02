// Aspect Ratio Utilities
// Handles selection adjustment for API-compatible aspect ratios

// Supported aspect ratios by Gemini API
const SUPPORTED_RATIOS = [
    { name: '8:1', value: 8 / 1 },
    { name: '4:1', value: 4 / 1 },
    { name: '21:9', value: 21 / 9 },
    { name: '16:9', value: 16 / 9 },
    { name: '5:4', value: 5 / 4 },
    { name: '4:3', value: 4 / 3 },
    { name: '3:2', value: 3 / 2 },
    { name: '1:1', value: 1 },
    { name: '4:5', value: 4 / 5 },
    { name: '3:4', value: 3 / 4 },
    { name: '2:3', value: 2 / 3 },
    { name: '9:16', value: 9 / 16 },
    { name: '1:4', value: 1 / 4 },
    { name: '1:8', value: 1 / 8 },
];

export interface AspectRatioAdjustment {
    originalWidth: number;
    originalHeight: number;
    adjustedWidth: number;
    adjustedHeight: number;
    originalRatio: string;
    closestRatio: string;
    needsAdjustment: boolean;
}

/**
 * Calculate the closest supported aspect ratio and adjusted dimensions
 * Adjusts by expanding the smaller dimension to maintain the selection area
 */
export function calculateAspectRatioAdjustment(
    width: number,
    height: number
): AspectRatioAdjustment {
    const currentRatio = width / height;

    // Find closest supported ratio
    let closest = SUPPORTED_RATIOS[0];
    let minDiff = Math.abs(currentRatio - closest.value);

    for (const ratio of SUPPORTED_RATIOS) {
        const diff = Math.abs(currentRatio - ratio.value);
        if (diff < minDiff) {
            minDiff = diff;
            closest = ratio;
        }
    }

    // Check if adjustment is needed (more than 1% difference)
    const needsAdjustment = minDiff > 0.01;

    if (!needsAdjustment) {
        return {
            originalWidth: width,
            originalHeight: height,
            adjustedWidth: width,
            adjustedHeight: height,
            originalRatio: formatRatio(currentRatio),
            closestRatio: closest.name,
            needsAdjustment: false,
        };
    }

    // Calculate adjusted dimensions
    // Strategy: expand to include the full original selection
    let adjustedWidth: number;
    let adjustedHeight: number;

    if (closest.value > currentRatio) {
        // Need wider - expand width, keep height
        adjustedWidth = Math.round(height * closest.value);
        adjustedHeight = height;
    } else {
        // Need taller - expand height, keep width
        adjustedWidth = width;
        adjustedHeight = Math.round(width / closest.value);
    }

    return {
        originalWidth: width,
        originalHeight: height,
        adjustedWidth,
        adjustedHeight,
        originalRatio: formatRatio(currentRatio),
        closestRatio: closest.name,
        needsAdjustment: true,
    };
}

function formatRatio(ratio: number): string {
    // Try to format as a simple ratio
    const testRatios = [
        [8, 1], [4, 1], [21, 9], [16, 9], [5, 4], [4, 3], [3, 2], [1, 1],
        [4, 5], [3, 4], [2, 3], [9, 16], [1, 4], [1, 8]
    ];

    for (const [w, h] of testRatios) {
        if (Math.abs(ratio - w / h) < 0.01) {
            return `${w}:${h}`;
        }
    }

    return ratio.toFixed(2) + ':1';
}

/**
 * Get the closest supported ratio string for given dimensions
 */
export function getClosestSupportedRatio(width: number, height: number): string {
    const currentRatio = width / height;

    let closest = SUPPORTED_RATIOS[0];
    let minDiff = Math.abs(currentRatio - closest.value);

    for (const ratio of SUPPORTED_RATIOS) {
        const diff = Math.abs(currentRatio - ratio.value);
        if (diff < minDiff) {
            minDiff = diff;
            closest = ratio;
        }
    }

    return closest.name;
}
