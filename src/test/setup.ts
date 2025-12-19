import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Canvas API Mocks
const mockContext = {
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    toDataURL: vi.fn().mockReturnValue('data:image/png;base64,'),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    globalAlpha: 1,
};

window.HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockContext);
(window as any).CanvasRenderingContext2D = vi.fn().mockImplementation(() => mockContext);

// Image Mock
class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private _src: string = '';
    width: number = 100;
    height: number = 100;

    get src() {
        return this._src;
    }

    set src(value: string) {
        this._src = value;
        setTimeout(() => {
            if (this.onload) this.onload();
        }, 0);
    }
}

(globalThis as any).Image = MockImage;
