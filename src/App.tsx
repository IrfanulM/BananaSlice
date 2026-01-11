// BananaSlice - Main Application Component
// Refactored to use custom hooks for better separation of concerns

import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

// Components
import { Canvas } from './components/Canvas';
import { SettingsModal } from './components/SettingsModal';
import { LayerPanel } from './components/LayerPanel';
import { ProgressIndicator } from './components/ProgressIndicator';
import { Tooltip } from './components/Tooltip';
import { ToastContainer } from './components/Toast';
import { KeyboardShortcuts } from './components/KeyboardShortcuts';
import { ReferenceImages } from './components/ReferenceImages';
import { ConfirmDialog } from './components/ConfirmDialog';
import { TabBar } from './components/TabBar';

// Stores
import { useCanvasStore } from './store/canvasStore';
import { useToolStore } from './store/toolStore';
import { useSelectionStore } from './store/selectionStore';
import { useLayerStore } from './store/layerStore';
import { useHistoryStore } from './store/historyStore';
import { useSettingsStore } from './store/settingsStore';
import { useRecentFilesStore } from './store/recentFilesStore';

// Custom Hooks
import {
    useFileOperations,
    useGeneration,
    useKeyboardShortcuts,
    useDragDrop,
    useWindowManagement,
} from './hooks';

// Types and Styles
import type { AIModel } from './types';
import './styles/index.css';

// Declare version constant from Vite define
declare const __APP_VERSION__: string;

interface AppInfo {
    name: string;
    version: string;
}

function App() {
    // UI State
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [fileMenuOpen, setFileMenuOpen] = useState(false);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [prompt, setPrompt] = useState('');
    const [referenceImages, setReferenceImages] = useState<string[]>([]);
    const fileMenuRef = useRef<HTMLDivElement>(null);

    // Store hooks
    const { baseImage, imagePath, isLoading, zoom, zoomIn, zoomOut, cursorX, cursorY } = useCanvasStore();
    const { activeTool, setActiveTool, shapeColor, setShapeColor } = useToolStore();
    const { activeSelection } = useSelectionStore();
    const { setBaseLayer } = useLayerStore();
    const { undo: handleUndo, redo: handleRedo, canUndo, canRedo, reset: resetHistory } = useHistoryStore();
    const { setDefaultModel: setModel } = useSettingsStore();
    const { recentFiles } = useRecentFilesStore();

    // Custom hooks
    const {
        isGenerating,
        generationStage,
        generationStages,
        error,
        aspectRatioDialog,
        model,
        handleGenerate,
        setAspectRatioDialog,
        getProgressStages,
    } = useGeneration({
        prompt,
        referenceImages,
        onOpenSettings: () => setSettingsOpen(true),
    });

    const {
        isSaving,
        isExporting,
        isProject,
        handleQuickSave,
        handleSaveProject,
        handleLoadProject,
        handleOpenImage,
        handleExport,
        handleOpenRecentFile,
    } = useFileOperations({ isGenerating });

    const { closeConfirmDialog, handleConfirmClose, handleCancelClose } = useWindowManagement();

    const { dragHoverSlot } = useDragDrop({
        isGenerating,
        referenceImages,
        setReferenceImages,
    });

    // Keyboard shortcuts hook
    useKeyboardShortcuts({
        isProject,
        hasImage: !!baseImage,
        onQuickSave: handleQuickSave,
        onSaveProject: handleSaveProject,
    });

    // Fetch app info on mount
    useEffect(() => {
        invoke<AppInfo>('get_app_info').catch(console.error);
    }, []);

    // Initialize base layer when a NEW image is loaded (skip for project files)
    useEffect(() => {
        if (baseImage && imagePath && !imagePath.endsWith('.banslice')) {
            setBaseLayer(baseImage.data, baseImage.width, baseImage.height);
            resetHistory();
        }
    }, [imagePath, setBaseLayer, baseImage, resetHistory]);

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

    return (
        <div className="app">
            {/* Modals */}
            <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
            <KeyboardShortcuts isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

            {/* Aspect Ratio Adjustment Dialog */}
            {aspectRatioDialog && (
                <ConfirmDialog
                    isOpen={aspectRatioDialog.open}
                    title="Selection Adjustment Required"
                    message={`When using reference images, the selection must match a supported aspect ratio.\n\nYour selection: ${aspectRatioDialog.originalRatio}\nClosest supported: ${aspectRatioDialog.adjustedRatio}\n\nThe selection will be adjusted by ${aspectRatioDialog.widthDiff > 0 ? '+' : ''}${aspectRatioDialog.widthDiff}px width and ${aspectRatioDialog.heightDiff > 0 ? '+' : ''}${aspectRatioDialog.heightDiff}px height.\n\nProceed with adjusted selection?`}
                    confirmText="Proceed"
                    cancelText="Cancel"
                    onConfirm={aspectRatioDialog.onConfirm}
                    onCancel={() => setAspectRatioDialog(null)}
                />
            )}

            {/* Unsaved Changes Close Confirmation Dialog */}
            <ConfirmDialog
                isOpen={closeConfirmDialog}
                title="Unsaved Changes"
                message="This project has unsaved changes. Are you sure you want to close without saving?"
                confirmText="Discard & Close"
                cancelText="Cancel"
                variant="danger"
                onConfirm={handleConfirmClose}
                onCancel={handleCancelClose}
            />

            {/* Top Bar */}
            <header className="top-bar">
                <div className="top-bar-left">
                    <img src="/logo.png" alt="BananaSlice" className="app-logo" />
                    <span className="app-title">BananaSlice</span>
                    <span className="app-version">v{__APP_VERSION__}</span>
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
                                <button onClick={() => { setFileMenuOpen(false); handleLoadProject(); }}>
                                    Open Project...
                                </button>
                                {recentFiles.length > 0 && (
                                    <div className="submenu-container">
                                        <button className="submenu-trigger">
                                            Recent Files
                                            <span className="submenu-arrow">▶</span>
                                        </button>
                                        <div className="submenu">
                                            {recentFiles.slice(0, 5).map((file) => (
                                                <button
                                                    key={file.path}
                                                    onClick={() => {
                                                        setFileMenuOpen(false);
                                                        handleOpenRecentFile(file.path, file.type);
                                                    }}
                                                    title={file.path}
                                                >
                                                    {file.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div className="menu-divider" />
                                <button onClick={() => { setFileMenuOpen(false); handleQuickSave(); }} disabled={!isProject}>
                                    Save
                                    <span className="menu-shortcut">Ctrl+S</span>
                                </button>
                                <button onClick={() => { setFileMenuOpen(false); handleSaveProject(); }} disabled={!baseImage}>
                                    Save Project As...
                                </button>
                                <div className="menu-divider" />
                                <div className="submenu-container">
                                    <button disabled={!baseImage} className="submenu-trigger">
                                        Export
                                        <span className="submenu-arrow">▶</span>
                                    </button>
                                    <div className="submenu">
                                        <button onClick={() => { setFileMenuOpen(false); handleExport('png'); }} disabled={!baseImage}>PNG</button>
                                        <button onClick={() => { setFileMenuOpen(false); handleExport('jpeg'); }} disabled={!baseImage}>JPEG</button>
                                        <button onClick={() => { setFileMenuOpen(false); handleExport('webp'); }} disabled={!baseImage}>WebP</button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    <button className="top-bar-btn">Edit</button>
                    <button className="top-bar-btn">View</button>
                    <button className="top-bar-btn" onClick={() => setSettingsOpen(true)}>Settings</button>
                    <button className="top-bar-btn" onClick={() => setShortcutsOpen(true)}>Help</button>
                </div>
                <div className="top-bar-right">
                    <Tooltip content="Undo" shortcut="Ctrl+Z" position="bottom">
                        <button className="top-bar-btn icon-btn" onClick={handleUndo} disabled={!canUndo()} aria-label="Undo">↩</button>
                    </Tooltip>
                    <Tooltip content="Redo" shortcut="Ctrl+Y" position="bottom">
                        <button className="top-bar-btn icon-btn" onClick={handleRedo} disabled={!canRedo()} aria-label="Redo">↪</button>
                    </Tooltip>
                </div>
            </header>

            {/* Project Tabs */}
            <TabBar isGenerating={isGenerating} />

            {/* Main Content Area */}
            <main className="main-content">
                {/* Left Toolbar */}
                <aside className="toolbar left-toolbar">
                    <div className="tool-group">
                        <Tooltip content="Move Tool" shortcut="V" position="right" description="Select and move layers">
                            <button className={`tool-btn ${activeTool === 'move' ? 'active' : ''}`} onClick={() => setActiveTool('move')} aria-label="Move Tool">
                                <img src="/move.svg" alt="Move" className="tool-icon" />
                            </button>
                        </Tooltip>
                        <Tooltip content="Rectangle Select" shortcut="M" position="right" description="Draw rectangular selections">
                            <button className={`tool-btn ${activeTool === 'rectangle' ? 'active' : ''}`} onClick={() => setActiveTool('rectangle')} aria-label="Rectangle Select">
                                <img src="/rectangle.svg" alt="Rectangle" className="tool-icon" />
                            </button>
                        </Tooltip>
                        <Tooltip content="Lasso Select [BETA]" shortcut="L" position="right" description="Draw freeform selections">
                            <button className={`tool-btn ${activeTool === 'lasso' ? 'active' : ''}`} onClick={() => setActiveTool('lasso')} aria-label="Lasso Select">
                                <img src="/lasso.svg" alt="Lasso" className="tool-icon" />
                            </button>
                        </Tooltip>
                    </div>
                    <div className="tool-divider"></div>
                    <div className="tool-group">
                        <Tooltip content="Rectangle Shape" shortcut="U" position="right" description="Draw filled rectangles">
                            <button className={`tool-btn ${activeTool === 'shape-rect' ? 'active' : ''}`} onClick={() => setActiveTool('shape-rect')} aria-label="Rectangle Shape">
                                <img src="/shape-rect.svg" alt="Rectangle Shape" className="tool-icon" />
                            </button>
                        </Tooltip>
                        <Tooltip content="Ellipse Shape" shortcut="O" position="right" description="Draw filled ellipses">
                            <button className={`tool-btn ${activeTool === 'shape-ellipse' ? 'active' : ''}`} onClick={() => setActiveTool('shape-ellipse')} aria-label="Ellipse Shape">
                                <img src="/shape-ellipse.svg" alt="Ellipse Shape" className="tool-icon" />
                            </button>
                        </Tooltip>
                        <Tooltip content="Shape Color" position="right" description="Click to change shape fill color">
                            <label className="color-picker-btn" style={{ backgroundColor: shapeColor }}>
                                <input type="color" value={shapeColor} onChange={(e) => setShapeColor(e.target.value)} className="color-picker-input" />
                            </label>
                        </Tooltip>
                    </div>
                    <div className="tool-divider"></div>
                    <div className="tool-group">
                        <Tooltip content="Zoom In" shortcut="+" position="right">
                            <button className="tool-btn" onClick={zoomIn} aria-label="Zoom In">
                                <img src="/zoom-in.svg" alt="Zoom In" className="tool-icon" />
                            </button>
                        </Tooltip>
                        <Tooltip content="Zoom Out" shortcut="-" position="right">
                            <button className="tool-btn" onClick={zoomOut} aria-label="Zoom Out">
                                <img src="/zoom-out.svg" alt="Zoom Out" className="tool-icon" />
                            </button>
                        </Tooltip>
                    </div>
                </aside>

                {/* Canvas Area */}
                <div className={`canvas-container ${baseImage ? 'has-image' : ''} tool-${activeTool}`}>
                    {/* Progress Overlays */}
                    <ProgressIndicator visible={isGenerating} message="Generating..." subMessage={generationStages[generationStage]} stages={getProgressStages()} />
                    <ProgressIndicator visible={isLoading} message="Loading image..." subMessage="Please wait" />
                    <ProgressIndicator visible={isSaving} message="Saving project..." />
                    <ProgressIndicator visible={isExporting} message="Exporting image..." />

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
                                <select className="select-input" value={model} onChange={(e) => setModel(e.target.value as AIModel)}>
                                    <option value="nano-banana-pro">Nano Banana Pro</option>
                                    <option value="nano-banana">Nano Banana (Fast)</option>
                                </select>
                            </div>

                            <ReferenceImages
                                images={referenceImages}
                                onChange={setReferenceImages}
                                maxImages={3}
                                externalDragHoverIndex={dragHoverSlot}
                            />

                            {error && <div className="error-message">{error}</div>}

                            <button
                                className={`generate-btn ${isGenerating ? 'loading' : ''}`}
                                disabled={!baseImage || !activeSelection || isGenerating}
                                onClick={handleGenerate}
                            >
                                {isGenerating ? (
                                    <>
                                        <span className="progress-spinner small" style={{ borderTopColor: 'currentColor', borderColor: 'rgba(0,0,0,0.2)' }} />
                                        Generating...
                                    </>
                                ) : 'Generate Fill'}
                            </button>

                            {!activeSelection && baseImage && (
                                <p className="hint-text">Draw a selection to enable generation</p>
                            )}
                        </div>
                    </div>

                    <LayerPanel />
                </aside>
            </main>

            {/* Bottom Bar */}
            <footer className="bottom-bar">
                <div className="bottom-bar-left">
                    <span className="status-text">
                        {isGenerating ? (
                            <span className="status-loading"><span className="progress-spinner" />{generationStages[generationStage]}...</span>
                        ) : isLoading ? (
                            <span className="status-loading"><span className="progress-spinner" />Loading...</span>
                        ) : isSaving ? (
                            <span className="status-loading"><span className="progress-spinner" />Saving...</span>
                        ) : isExporting ? (
                            <span className="status-loading"><span className="progress-spinner" />Exporting...</span>
                        ) : baseImage ? 'Ready' : 'No image loaded'}
                    </span>
                </div>
                <div className="bottom-bar-center">
                    <span className="coordinates">X: {cursorX}, Y: {cursorY}</span>
                </div>
                <div className="bottom-bar-right">
                    <div className="zoom-controls">
                        <Tooltip content="Zoom Out" shortcut="-" position="top">
                            <button className="zoom-btn" onClick={zoomOut} aria-label="Zoom Out">−</button>
                        </Tooltip>
                        <Tooltip content="Current zoom level" position="top">
                            <span className="zoom-level">{Math.round(zoom)}%</span>
                        </Tooltip>
                        <Tooltip content="Zoom In" shortcut="+" position="left">
                            <button className="zoom-btn" onClick={zoomIn} aria-label="Zoom In">+</button>
                        </Tooltip>
                    </div>
                </div>
            </footer>

            {/* Toast Notifications */}
            <ToastContainer />
        </div>
    );
}

export default App;
