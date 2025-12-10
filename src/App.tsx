import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Canvas } from './components/Canvas';
import { useCanvasStore } from './store/canvasStore';
import { useToolStore } from './store/toolStore';
import './styles/index.css';

interface AppInfo {
    name: string;
    version: string;
}

function App() {
    const {
        baseImage,
        isLoading,
        loadImage,
        zoom,
        zoomIn,
        zoomOut,
        cursorX,
        cursorY
    } = useCanvasStore();

    const {
        activeTool,
        setActiveTool
    } = useToolStore();

    useEffect(() => {
        invoke<AppInfo>('get_app_info').catch(console.error);
    }, []);

    const handleOpenImage = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'Image',
                    extensions: ['png', 'jpg', 'jpeg', 'webp']
                }]
            });

            if (selected && typeof selected === 'string') {
                await loadImage(selected);
            }
        } catch (error) {
            console.error('Failed to open image:', error);
        }
    };

    return (
        <div className="app">
            {/* Top Bar */}
            <header className="top-bar">
                <div className="top-bar-left">
                    <span className="app-logo">🍌</span>
                    <span className="app-title">BananaSlice</span>
                    <span className="app-version">v0.1.0</span>
                </div>
                <div className="top-bar-center">
                    <button className="top-bar-btn" onClick={handleOpenImage}>File</button>
                    <button className="top-bar-btn">Edit</button>
                    <button className="top-bar-btn">View</button>
                    <button className="top-bar-btn">Help</button>
                </div>
                <div className="top-bar-right">
                    <button className="top-bar-btn icon-btn" title="Undo">↩</button>
                    <button className="top-bar-btn icon-btn" title="Redo">↪</button>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="main-content">
                {/* Left Toolbar */}
                <aside className="toolbar left-toolbar">
                    <div className="tool-group">
                        <button
                            className={`tool-btn ${activeTool === 'move' ? 'active' : ''}`}
                            title="Move Tool (V)"
                            onClick={() => setActiveTool('move')}
                        >
                            <span className="tool-icon">✥</span>
                        </button>
                        <button
                            className={`tool-btn ${activeTool === 'rectangle' ? 'active' : ''}`}
                            title="Rectangle Marquee (M)"
                            onClick={() => setActiveTool('rectangle')}
                        >
                            <span className="tool-icon">▭</span>
                        </button>
                        <button
                            className={`tool-btn ${activeTool === 'lasso' ? 'active' : ''}`}
                            title="Lasso Select (L)"
                            onClick={() => setActiveTool('lasso')}
                        >
                            <span className="tool-icon">◯</span>
                        </button>
                    </div>
                    <div className="tool-divider"></div>
                    <div className="tool-group">
                        <button className="tool-btn" title="Zoom In (+)" onClick={zoomIn}>
                            <span className="tool-icon">🔍+</span>
                        </button>
                        <button className="tool-btn" title="Zoom Out (-)" onClick={zoomOut}>
                            <span className="tool-icon">🔍-</span>
                        </button>
                    </div>
                </aside>

                {/* Canvas Area */}
                <div className={`canvas-container ${baseImage ? 'has-image' : ''}`}>
                    {!baseImage ? (
                        <div className="canvas-wrapper">
                            <div className="empty-state">
                                <div className="empty-icon">🖼️</div>
                                <h2>Welcome to BananaSlice</h2>
                                <p>Open an image to get started with AI-powered generative fill</p>
                                <button className="primary-btn" onClick={handleOpenImage} disabled={isLoading}>
                                    {isLoading ? 'Opening...' : 'Open Image'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <Canvas />
                    )}
                </div>

                {/* Right Panel */}
                <aside className="panel right-panel">
                    <div className="panel-section">
                        <h3 className="panel-title">AI Generation</h3>
                        <div className="panel-content">
                            <label className="input-label">
                                Prompt
                                <textarea
                                    className="prompt-input"
                                    placeholder="Describe what you want to generate..."
                                    rows={4}
                                />
                            </label>

                            <div className="model-selector">
                                <label className="input-label">Model</label>
                                <select className="select-input">
                                    <option value="nano-banana-pro">Nano Banana Pro (4K)</option>
                                    <option value="nano-banana">Nano Banana (Fast)</option>
                                </select>
                            </div>

                            <label className="input-label">
                                Strength
                                <input type="range" min="0" max="100" defaultValue="75" className="slider" />
                            </label>

                            <label className="input-label">
                                Guidance
                                <input type="range" min="1" max="20" defaultValue="7" className="slider" />
                            </label>

                            <button className="generate-btn" disabled={!baseImage}>
                                Generate Fill
                            </button>
                        </div>
                    </div>
                </aside>
            </main>

            {/* Bottom Bar */}
            <footer className="bottom-bar">
                <div className="bottom-bar-left">
                    <span className="status-text">
                        {isLoading ? 'Loading...' : baseImage ? 'Image loaded' : 'Ready'}
                    </span>
                </div>
                <div className="bottom-bar-center">
                    <span className="coordinates">X: {cursorX}, Y: {cursorY}</span>
                </div>
                <div className="bottom-bar-right">
                    <div className="zoom-controls">
                        <button className="zoom-btn" onClick={zoomOut}>−</button>
                        <span className="zoom-level">{Math.round(zoom)}%</span>
                        <button className="zoom-btn" onClick={zoomIn}>+</button>
                    </div>
                </div>
            </footer>
        </div>
    );
}

export default App;
