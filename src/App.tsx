import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Canvas } from './components/Canvas';
import { SettingsModal } from './components/SettingsModal';
import { LayerPanel } from './components/LayerPanel';
import { useCanvasStore } from './store/canvasStore';
import { useToolStore } from './store/toolStore';
import { useSelectionStore } from './store/selectionStore';
import { useLayerStore } from './store/layerStore';
import { generateFill, hasApiKey } from './api';
import type { AIModel } from './types';
import './styles/index.css';

interface AppInfo {
    name: string;
    version: string;
}

function App() {
    const {
        baseImage,
        imagePath,
        isLoading,
        loadImage,
        imageTransform,
        zoom,
        zoomIn,
        zoomOut,
        cursorX,
        cursorY
    } = useCanvasStore();

    const { activeTool, setActiveTool } = useToolStore();

    const { activeSelection, processForAPI } = useSelectionStore();

    const {
        setBaseLayer,
        addLayer,
    } = useLayerStore();

    // UI State
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [prompt, setPrompt] = useState('');
    const [model, setModel] = useState<AIModel>('nano-banana-pro');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        invoke<AppInfo>('get_app_info').catch(console.error);
    }, []);

    // Initialize base layer when a NEW image is loaded (not when composite updates)
    useEffect(() => {
        if (baseImage && imagePath) {
            setBaseLayer(baseImage.data, baseImage.width, baseImage.height);
        }
    }, [imagePath, setBaseLayer]);
    const handleLayerChange = async () => {
    };

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

    const handleGenerate = async () => {
        if (!baseImage || !activeSelection) {
            setError('Please make a selection first');
            return;
        }

        if (!prompt.trim()) {
            setError('Please enter a prompt');
            return;
        }

        // Check API key
        const keyConfigured = await hasApiKey();
        if (!keyConfigured) {
            setError('Please configure your API key in Settings');
            setSettingsOpen(true);
            return;
        }

        setIsGenerating(true);
        setError(null);

        try {
            // Validate image transform is available
            if (!imageTransform) {
                throw new Error('Image transform not available. Please reload the image.');
            }

            // Process selection to get cropped image and mask
            const processed = await processForAPI(
                baseImage.data,
                baseImage.format,
                imageTransform,
                baseImage.width,
                baseImage.height
            );

            if (!processed) {
                throw new Error('Failed to process selection');
            }

            // Call generate API
            const genResult = await generateFill(
                model,
                prompt,
                processed.croppedImageBase64,
                processed.maskBase64
            );

            if (!genResult.success || !genResult.image_base64) {
                throw new Error(genResult.error || 'Generation failed');
            }

            // Add the generated patch as a new layer (with position info)
            // This stores just the patch, not the full composited image
            addLayer({
                name: `Edit: ${prompt.substring(0, 20)}${prompt.length > 20 ? '...' : ''}`,
                type: 'edit',
                imageData: genResult.image_base64,
                visible: true,
                opacity: 100,
                x: processed.bounds.x,
                y: processed.bounds.y,
                width: processed.bounds.width,
                height: processed.bounds.height,
            });



        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="app">
            {/* Settings Modal */}
            <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

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
                    <button className="top-bar-btn" onClick={() => setSettingsOpen(true)}>Settings</button>
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
                        <h3 className="panel-title">Generative Fill</h3>
                        <div className="panel-content">
                            <label className="input-label">
                                Prompt
                                <textarea
                                    className="prompt-input"
                                    placeholder="Describe what you want to generate..."
                                    rows={4}
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                />
                            </label>

                            <div className="model-selector">
                                <label className="input-label">Model</label>
                                <select
                                    className="select-input"
                                    value={model}
                                    onChange={(e) => setModel(e.target.value as AIModel)}
                                >
                                    <option value="nano-banana-pro">Nano Banana Pro</option>
                                    <option value="nano-banana">Nano Banana (Fast)</option>
                                </select>
                            </div>

                            {error && (
                                <div className="error-message">{error}</div>
                            )}

                            <button
                                className="generate-btn"
                                disabled={!baseImage || !activeSelection || isGenerating}
                                onClick={handleGenerate}
                            >
                                {isGenerating ? 'Generating...' : 'Generate Fill'}
                            </button>

                            {!activeSelection && baseImage && (
                                <p className="hint-text">Draw a selection to enable generation</p>
                            )}
                        </div>
                    </div>

                    {/* Layer Panel */}
                    <LayerPanel onLayerChange={handleLayerChange} />
                </aside>
            </main>

            {/* Bottom Bar */}
            <footer className="bottom-bar">
                <div className="bottom-bar-left">
                    <span className="status-text">
                        {isGenerating ? 'Generating...' : isLoading ? 'Loading...' : baseImage ? 'Image loaded' : 'Ready'}
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

