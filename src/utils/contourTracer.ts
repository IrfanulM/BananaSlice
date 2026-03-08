// Contour Tracing Utilities
// Converts a binary segmentation mask into polygon points using
// Marching Squares algorithm + Douglas-Peucker simplification.

export interface Point2D {
    x: number;
    y: number;
}

/**
 * Extract contour points from a binary mask using Marching Squares.
 * The mask is expected as a Uint8Array where non-zero = foreground.
 *
 * @param mask - Flat array of mask values (0 = background, non-zero = foreground)
 * @param width - Width of the mask image
 * @param height - Height of the mask image
 * @returns Array of contour points in pixel coordinates
 */
export function marchingSquares(mask: Uint8Array, width: number, height: number): Point2D[] {
    // Helper to sample the mask, treating out-of-bounds as background
    const sample = (x: number, y: number): number => {
        if (x < 0 || x >= width || y < 0 || y >= height) return 0;
        return mask[y * width + x] > 0 ? 1 : 0;
    };

    // Find a starting edge pixel (first foreground pixel with a background neighbor)
    let startX = -1;
    let startY = -1;

    outer:
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (sample(x, y) === 1) {
                // Check if it's an edge pixel (has at least one background neighbor)
                if (
                    sample(x - 1, y) === 0 ||
                    sample(x + 1, y) === 0 ||
                    sample(x, y - 1) === 0 ||
                    sample(x, y + 1) === 0
                ) {
                    startX = x;
                    startY = y;
                    break outer;
                }
            }
        }
    }

    if (startX === -1) return [];

    // March around the contour using the marching squares lookup
    // We work on grid cells (each cell is between 4 sample points)
    const contour: Point2D[] = [];

    // Direction vectors: 0=right, 1=down, 2=left, 3=up
    const dx = [1, 0, -1, 0];
    const dy = [0, 1, 0, -1];

    // Start one cell up-left of the starting pixel
    let cx = startX - 1;
    let cy = startY - 1;
    let dir = 0; // initial direction: right

    const maxSteps = width * height * 4; // prevent infinite loops
    let steps = 0;

    // The starting cell position for termination check
    const originCX = cx;
    const originCY = cy;
    let passedStart = false;

    do {
        // Sample the 4 corners of the current cell
        // Cell (cx, cy) has corners at (cx, cy), (cx+1, cy), (cx, cy+1), (cx+1, cy+1)
        const tl = sample(cx, cy);
        const tr = sample(cx + 1, cy);
        const bl = sample(cx, cy + 1);
        const br = sample(cx + 1, cy + 1);

        // Build the case index (4-bit)
        const caseIndex = (tl << 3) | (tr << 2) | (br << 1) | bl;

        // Add a point at the center-right edge of the cell based on the march
        // We record the cell corner as the contour point
        contour.push({ x: cx + 1, y: cy + 1 });

        // Determine next direction based on current case and previous direction
        // Using simplified marching squares for boundary tracing
        switch (caseIndex) {
            case 0: // all empty - shouldn't happen in a valid trace
                break;
            case 1:  // bl only
                dir = 2; // left
                break;
            case 2:  // br only
                dir = 1; // down
                break;
            case 3:  // bl + br
                dir = 2; // left
                break;
            case 4:  // tr only
                dir = 0; // right
                break;
            case 5:  // tr + bl (saddle)
                dir = (dir === 1) ? 2 : 0; // resolve ambiguity based on previous direction
                break;
            case 6:  // tr + br
                dir = 1; // down
                break;
            case 7:  // tr + br + bl
                dir = 2; // left
                break;
            case 8:  // tl only
                dir = 3; // up
                break;
            case 9:  // tl + bl
                dir = 3; // up
                break;
            case 10: // tl + br (saddle)
                dir = (dir === 0) ? 3 : 1; // resolve ambiguity
                break;
            case 11: // tl + bl + br
                dir = 3; // up
                break;
            case 12: // tl + tr
                dir = 0; // right
                break;
            case 13: // tl + tr + bl
                dir = 0; // right
                break;
            case 14: // tl + tr + br
                dir = 1; // down
                break;
            case 15: // all filled - inside, shouldn't happen on boundary
                break;
        }

        // Move to next cell
        cx += dx[dir];
        cy += dy[dir];

        steps++;

        // Check if we've returned to the start
        if (cx === originCX && cy === originCY) {
            if (passedStart) break;
            passedStart = true;
        }
    } while (steps < maxSteps);

    return contour;
}

/**
 * Douglas-Peucker line simplification algorithm.
 * Reduces the number of points in a polygon while preserving its shape.
 *
 * @param points - Array of points to simplify
 * @param tolerance - Maximum distance a point can be from the simplified line
 * @returns Simplified array of points
 */
export function douglasPeucker(points: Point2D[], tolerance: number): Point2D[] {
    if (points.length <= 2) return points;

    // Find the point with maximum distance from the line between first and last
    let maxDist = 0;
    let maxIndex = 0;

    const first = points[0];
    const last = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
        const dist = perpendicularDistance(points[i], first, last);
        if (dist > maxDist) {
            maxDist = dist;
            maxIndex = i;
        }
    }

    // If max distance exceeds tolerance, recursively simplify
    if (maxDist > tolerance) {
        const left = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
        const right = douglasPeucker(points.slice(maxIndex), tolerance);

        // Combine (remove duplicate point at junction)
        return [...left.slice(0, -1), ...right];
    }

    // All points within tolerance, just keep endpoints
    return [first, last];
}

/**
 * Calculate perpendicular distance from a point to a line defined by two endpoints.
 */
function perpendicularDistance(point: Point2D, lineStart: Point2D, lineEnd: Point2D): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;

    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
        // Line start and end are the same point
        const pdx = point.x - lineStart.x;
        const pdy = point.y - lineStart.y;
        return Math.sqrt(pdx * pdx + pdy * pdy);
    }

    const num = Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x);
    return num / Math.sqrt(lengthSq);
}

/**
 * Full pipeline: binary mask → simplified polygon contour points.
 *
 * @param mask - Uint8Array where non-zero = foreground object
 * @param width - Width of the mask
 * @param height - Height of the mask
 * @param simplifyTolerance - Douglas-Peucker tolerance (default 2.0 pixels)
 * @returns Array of simplified polygon points, or empty array if no contour found
 */
export function maskToPolygon(
    mask: Uint8Array,
    width: number,
    height: number,
    simplifyTolerance: number = 2.0
): Point2D[] {
    const rawContour = marchingSquares(mask, width, height);

    if (rawContour.length < 3) return [];

    // Simplify with Douglas-Peucker
    const simplified = douglasPeucker(rawContour, simplifyTolerance);

    // Ensure we have enough points for a valid polygon
    if (simplified.length < 3) return rawContour.length >= 3 ? rawContour : [];

    return simplified;
}
