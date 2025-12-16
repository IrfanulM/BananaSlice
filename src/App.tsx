import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Canvas } from './components/Canvas';
import { SettingsModal } from './components/SettingsModal';
import { LayerPanel } from './components/LayerPanel';
import { useCanvasStore } from './store/canvasStore';
import { useToolStore } from './store/toolStore';
import { useSelectionStore } from './store/selectionStore';
import { useLayerStore } from './store/layerStore';
import { generateFill, hasApiKey } from './api';
import { saveProject, loadProject, quickSave } from './utils/projectManager';
import { exportImage } from './utils/exportManager';
import type { ExportFormat } from './utils/exportManager';
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
    const [fileMenuOpen, setFileMenuOpen] = useState(false);
    const fileMenuRef = useRef<HTMLDivElement>(null);
    const [prompt, setPrompt] = useState('');
    const [model, setModel] = useState<AIModel>('nano-banana-pro');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        invoke<AppInfo>('get_app_info').catch(console.error);
    }, []);

    // Update window title dynamically
    useEffect(() => {
        const setWindowTitle = async () => {
            const window = getCurrentWindow();

            if (!baseImage) {
                // Nothing open
                await window.setTitle('BananaSlice');
            } else if (imagePath?.endsWith('.banslice')) {
                // Project file is open - extract project name from path
                const fileName = imagePath.split(/[\\/]/).pop() || 'Untitled Project';
                const projectName = fileName.replace('.banslice', '');
                await window.setTitle(`${projectName} | BananaSlice`);
            } else {
                // Raw image is open
                await window.setTitle('Untitled Project | BananaSlice');
            }
        };

        setWindowTitle().catch(console.error);
    }, [baseImage, imagePath]);

    // Initialize base layer when a NEW image is loaded (skip for project files)
    useEffect(() => {
        if (baseImage && imagePath && !imagePath.endsWith('.banslice')) {
            setBaseLayer(baseImage.data, baseImage.width, baseImage.height);
        }
    }, [imagePath, setBaseLayer, baseImage]);

    // Close file menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
                setFileMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    const handleLayerChange = async () => { };

    // Check if we're working on a saved project
    const isProject = imagePath?.endsWith('.banslice') ?? false;

    const handleQuickSave = async () => {
        setFileMenuOpen(false);
        if (!isProject) return;
        try {
            await quickSave();
            console.log('Project saved');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save');
        }
    };

    const handleSaveProject = async () => {
        setFileMenuOpen(false);
        try {
            const path = await saveProject();
            if (path) {
                console.log('Project saved to:', path);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save project');
        }
    };

    const handleLoadProject = async () => {
        setFileMenuOpen(false);
        try {
            const result = await loadProject();
            if (!result.success && result.error) {
                setError(result.error);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load project');
        }
    };

    const handleExport = async (format: ExportFormat) => {
        setFileMenuOpen(false);
        try {
            const path = await exportImage({ format, quality: 92 });
            if (path) {
                console.log('Exported to:', path);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to export');
        }
    };

    // Ctrl+S keyboard shortcut
    useEffect(() => {
        const handleKeyDown = async (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (isProject) {
                    await handleQuickSave();
                } else if (baseImage) {
                    await handleSaveProject();
                }
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isProject, baseImage]);

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
                    <img src="/logo.png" alt="BananaSlice" className="app-logo" />
                    <span className="app-title">BananaSlice</span>
                    <span className="app-version">v0.1.0</span>
                </div>
                <div className="top-bar-center">
                    <div className="menu-container" ref={fileMenuRef}>
                        <button
                            className={`top-bar-btn ${fileMenuOpen ? 'active' : ''}`}
                            onClick={() => setFileMenuOpen(!fileMenuOpen)}
                        >
                            File
                        </button>
                        {fileMenuOpen && (
                            <div className="dropdown-menu">
                                <button onClick={() => { setFileMenuOpen(false); handleOpenImage(); }}>
                                    Open Image...
                                </button>
                                <button onClick={handleLoadProject}>
                                    Open Project...
                                </button>
                                <div className="menu-divider" />
                                <button onClick={handleQuickSave} disabled={!isProject}>
                                    Save
                                    <span className="menu-shortcut">Ctrl+S</span>
                                </button>
                                <button onClick={handleSaveProject} disabled={!baseImage}>
                                    Save Project As...
                                </button>
                                <div className="menu-divider" />
                                <div className="submenu-container">
                                    <button disabled={!baseImage} className="submenu-trigger">
                                        Export
                                        <span className="submenu-arrow">▶</span>
                                    </button>
                                    <div className="submenu">
                                        <button onClick={() => handleExport('png')} disabled={!baseImage}>
                                            PNG
                                        </button>
                                        <button onClick={() => handleExport('jpeg')} disabled={!baseImage}>
                                            JPEG
                                        </button>
                                        <button onClick={() => handleExport('webp')} disabled={!baseImage}>
                                            WebP
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
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
                            <img src="/move.svg" alt="Move" className="tool-icon" />
                        </button>
                        <button
                            className={`tool-btn ${activeTool === 'rectangle' ? 'active' : ''}`}
                            title="Rectangle Marquee (M)"
                            onClick={() => setActiveTool('rectangle')}
                        >
                            <img src="/rectangle.svg" alt="Rectangle" className="tool-icon" />
                        </button>
                        <button
                            className={`tool-btn ${activeTool === 'lasso' ? 'active' : ''}`}
                            title="Lasso Select (L)"
                            onClick={() => setActiveTool('lasso')}
                        >
                            <img src="/lasso.svg" alt="Lasso" className="tool-icon" />
                        </button>
                    </div>
                    <div className="tool-divider"></div>
                    <div className="tool-group">
                        <button className="tool-btn" title="Zoom In (+)" onClick={zoomIn}>
                            <img src="/zoom-in.svg" alt="Zoom In" className="tool-icon" />
                        </button>
                        <button className="tool-btn" title="Zoom Out (-)" onClick={zoomOut}>
                            <img src="/zoom-out.svg" alt="Zoom Out" className="tool-icon" />
                        </button>
                    </div>
                </aside>

                {/* Canvas Area */}
                <div className={`canvas-container ${baseImage ? 'has-image' : ''}`}>
                    {!baseImage ? (
                        <div className="canvas-wrapper">
                            <div className="empty-state">
                                <img src="/logo.png" alt="BananaSlice" className="empty-icon" />
                                <h2>Welcome to BananaSlice</h2>
                                <p>Open an image to get started with AI-powered generative fill</p>
                                <button className="primary-btn" onClick={handleOpenImage} disabled={isLoading}>
                                    {isLoading ? 'Opening...' : 'Open Image'}
                                </button>
                                <button className="primary-btn" onClick={handleLoadProject} disabled={isLoading} style={{ marginTop: '8px' }}>
                                    Open Project
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

