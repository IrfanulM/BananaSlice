import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Canvas } from './components/Canvas';
import { SettingsModal } from './components/SettingsModal';
import { LayerPanel } from './components/LayerPanel';
import { ProgressIndicator, type ProgressStage } from './components/ProgressIndicator';
import { Tooltip } from './components/Tooltip';
import { ToastContainer } from './components/Toast';
import { KeyboardShortcuts } from './components/KeyboardShortcuts';
import { ReferenceImages } from './components/ReferenceImages';
import { ConfirmDialog } from './components/ConfirmDialog';
import { toast } from './store/toastStore';
import { useCanvasStore } from './store/canvasStore';
import { useToolStore } from './store/toolStore';
import { useSelectionStore } from './store/selectionStore';
import { useLayerStore } from './store/layerStore';
import { useHistoryStore } from './store/historyStore';
import { useSettingsStore } from './store/settingsStore';
import { useRecentFilesStore } from './store/recentFilesStore';
import { generateFill, hasApiKey } from './api';
import { saveProject, loadProject, quickSave } from './utils/projectManager';
import { exportImage } from './utils/exportManager';
import { compositeLayersInBrowser } from './utils/layerCompositor';
import { calculateAspectRatioAdjustment } from './utils/aspectRatio';
import { getSelectionBoundsCanvas } from './utils/selectionProcessor';
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

    const { activeTool, setActiveTool, shapeColor, setShapeColor } = useToolStore();

    const { activeSelection, processForAPI, clearSelection, setActiveSelection } = useSelectionStore();

    const {
        setBaseLayer,
        addLayer,
        getVisibleLayers,
    } = useLayerStore();

    const {
        undo: handleUndo,
        redo: handleRedo,
        canUndo,
        canRedo,
        reset: resetHistory,
    } = useHistoryStore();

    // UI State
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [fileMenuOpen, setFileMenuOpen] = useState(false);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const fileMenuRef = useRef<HTMLDivElement>(null);
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationStage, setGenerationStage] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [referenceImages, setReferenceImages] = useState<string[]>([]);
    const [aspectRatioDialog, setAspectRatioDialog] = useState<{
        open: boolean;
        originalRatio: string;
        adjustedRatio: string;
        widthDiff: number;
        heightDiff: number;
        onConfirm: () => void;
    } | null>(null);

    // Recent files
    const { recentFiles, addRecentFile } = useRecentFilesStore();

    // Model preference from persistent settings store
    const { defaultModel: model, setDefaultModel: setModel } = useSettingsStore();

    // Generation stage labels
    const generationStages = [
        'Processing selection',
        'Generating with AI',
        'Applying result',
    ];

    // Create progress stages based on current stage
    const getProgressStages = (): ProgressStage[] => {
        return generationStages.map((label, index) => ({
            id: `stage-${index}`,
            label,
            status: index < generationStage ? 'complete' : index === generationStage ? 'active' : 'pending',
        }));
    };

    useEffect(() => {
        invoke<AppInfo>('get_app_info').catch(console.error);
    }, []);

    // Check for unsaved changes (history has more than 1 state = changes made)
    const hasUnsavedChanges = canUndo();

    // Update window title dynamically (with asterisk for unsaved changes)
    useEffect(() => {
        const setWindowTitle = async () => {
            const window = getCurrentWindow();
            const unsavedMarker = hasUnsavedChanges ? '*' : '';

            if (!baseImage) {
                // Nothing open
                await window.setTitle('BananaSlice');
            } else if (imagePath?.endsWith('.banslice')) {
                // Project file is open - extract project name from path
                const fileName = imagePath.split(/[\\\\/]/).pop() || 'Untitled Project';
                const projectName = fileName.replace('.banslice', '');
                await window.setTitle(`${unsavedMarker}${projectName} | BananaSlice`);
            } else {
                // Raw image is open
                await window.setTitle(`${unsavedMarker}Untitled Project | BananaSlice`);
            }
        };

        setWindowTitle().catch(console.error);
    }, [baseImage, imagePath, hasUnsavedChanges]);

    // Initialize base layer when a NEW image is loaded (skip for project files)
    useEffect(() => {
        if (baseImage && imagePath && !imagePath.endsWith('.banslice')) {
            setBaseLayer(baseImage.data, baseImage.width, baseImage.height);
            // Reset history for new image
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


    // Check if we're working on a saved project
    const isProject = imagePath?.endsWith('.banslice') ?? false;

    const handleQuickSave = async () => {
        setFileMenuOpen(false);
        if (!isProject) return;
        setIsSaving(true);
        try {
            await quickSave();
            toast.success('Project saved successfully');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            toast.error(`Failed to save project: ${message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveProject = async () => {
        setFileMenuOpen(false);
        setIsSaving(true);
        try {
            const path = await saveProject();
            if (path) {
                const fileName = path.split(/[\\/]/).pop() || 'project';
                toast.success(`Saved as ${fileName}`);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            toast.error(`Failed to save project: ${message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleLoadProject = async () => {
        setFileMenuOpen(false);
        try {
            const result = await loadProject();
            if (result.success) {
                toast.success('Project loaded successfully');
                if (result.path) {
                    addRecentFile(result.path, 'project');
                }
            } else if (result.error) {
                toast.error(`Failed to load project: ${result.error}`);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            toast.error(`Failed to load project: ${message}`);
        }
    };

    const handleExport = async (format: ExportFormat) => {
        setFileMenuOpen(false);
        setIsExporting(true);
        try {
            const path = await exportImage({ format, quality: 92 });
            if (path) {
                const fileName = path.split(/[\\/]/).pop() || 'image';
                toast.success(`Exported as ${fileName}`);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            toast.error(`Export failed: ${message}`);
        } finally {
            setIsExporting(false);
        }
    };


    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = async (e: KeyboardEvent) => {
            // Don't trigger shortcuts when typing in inputs
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                return;
            }

            // Save shortcuts: Ctrl+S
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (isProject) {
                    await handleQuickSave();
                } else if (baseImage) {
                    await handleSaveProject();
                }
            }

            // Undo: Ctrl+Z
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                handleUndo();
            }

            // Redo: Ctrl+Y or Ctrl+Shift+Z
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                handleRedo();
            }

            // Tool shortcuts (only when not holding modifier keys)
            if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                switch (e.key.toLowerCase()) {
                    case 'v':
                        setActiveTool('move');
                        break;
                    case 'm':
                        setActiveTool('rectangle');
                        break;
                    case 'l':
                        setActiveTool('lasso');
                        break;
                    case 'u':
                        setActiveTool('shape-rect');
                        break;
                    case 'o':
                        setActiveTool('shape-ellipse');
                        break;
                    case 'd':
                        // Deselect - clear selection
                        clearSelection();
                        break;
                    case '=':
                    case '+':
                        // Zoom in
                        e.preventDefault();
                        zoomIn();
                        break;
                    case '-':
                    case '_':
                        // Zoom out
                        e.preventDefault();
                        zoomOut();
                        break;
                }
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isProject, baseImage, setActiveTool, clearSelection, zoomIn, zoomOut]);

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
                addRecentFile(selected, 'image');
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

        // Check if aspect ratio adjustment is needed when reference images are used
        if (referenceImages.length > 0) {
            const selectionBounds = getSelectionBoundsCanvas(activeSelection);
            if (selectionBounds) {
                const adjustment = calculateAspectRatioAdjustment(
                    selectionBounds.width,
                    selectionBounds.height
                );

                if (adjustment.needsAdjustment) {
                    // Show confirmation dialog
                    setAspectRatioDialog({
                        open: true,
                        originalRatio: adjustment.originalRatio,
                        adjustedRatio: adjustment.closestRatio,
                        widthDiff: adjustment.adjustedWidth - adjustment.originalWidth,
                        heightDiff: adjustment.adjustedHeight - adjustment.originalHeight,
                        onConfirm: () => {
                            setAspectRatioDialog(null);

                            // Actually resize the selection to the adjusted dimensions
                            // Get current selection properties
                            const currentWidth = activeSelection.width * (activeSelection.scaleX || 1);
                            const currentHeight = activeSelection.height * (activeSelection.scaleY || 1);

                            // Calculate scale factors to achieve new dimensions
                            const newScaleX = adjustment.adjustedWidth / activeSelection.width;
                            const newScaleY = adjustment.adjustedHeight / activeSelection.height;

                            // Center the expansion - adjust position
                            const widthChange = adjustment.adjustedWidth - currentWidth;
                            const heightChange = adjustment.adjustedHeight - currentHeight;

                            // Apply the new size to the selection
                            activeSelection.set({
                                scaleX: newScaleX,
                                scaleY: newScaleY,
                                left: activeSelection.left - widthChange / 2,
                                top: activeSelection.top - heightChange / 2,
                            });
                            activeSelection.setCoords();

                            // Re-render the canvas to show the adjusted selection
                            if (activeSelection.canvas) {
                                activeSelection.canvas.renderAll();
                            }

                            // Update the selection store with the modified selection
                            setActiveSelection(activeSelection);

                            toast.info(`Selection adjusted to ${adjustment.closestRatio} ratio`);

                            // Now proceed with generation using the resized selection
                            doGenerate();
                        }
                    });
                    return;
                }
            }
        }

        // Proceed directly if no adjustment needed
        doGenerate();

        async function doGenerate() {
            setIsGenerating(true);
            setGenerationStage(0);
            setError(null);

            try {
                // Validate baseImage is available
                if (!baseImage) {
                    throw new Error('No image loaded.');
                }

                // Validate image transform is available
                if (!imageTransform) {
                    throw new Error('Image transform not available. Please reload the image.');
                }

                // Stage 1: Composite visible layers and process selection
                setGenerationStage(0);

                // Get all visible layers and composite them
                const visibleLayers = getVisibleLayers();
                let imageDataForAPI = baseImage.data;

                // If there are multiple visible layers, composite them first
                if (visibleLayers.length > 1) {
                    imageDataForAPI = await compositeLayersInBrowser(
                        visibleLayers,
                        baseImage.width,
                        baseImage.height
                    );
                }

                const processed = await processForAPI(
                    imageDataForAPI,
                    'png', // Composite is always PNG
                    imageTransform,
                    baseImage.width,
                    baseImage.height
                );

                if (!processed) {
                    throw new Error('Failed to process selection');
                }

                // Stage 2: Call generate API with optional reference images
                setGenerationStage(1);
                const genResult = await generateFill(
                    model,
                    prompt,
                    processed.croppedImageBase64,
                    processed.maskBase64,
                    referenceImages
                );

                if (!genResult.success || !genResult.image_base64) {
                    throw new Error(genResult.error || 'Generation failed');
                }

                // Stage 3: Apply polygon mask to result if this was a lasso selection
                setGenerationStage(2);
                let finalImageBase64 = genResult.image_base64;
                if (processed.polygonMaskBase64) {
                    const { applyPolygonMaskToResult } = await import('./utils/selectionProcessor');
                    finalImageBase64 = await applyPolygonMaskToResult(
                        genResult.image_base64,
                        processed.polygonMaskBase64,
                        processed.bounds.width,
                        processed.bounds.height
                    );
                }

                // Add the generated patch as a new layer
                addLayer({
                    name: `Edit: ${prompt.substring(0, 20)}${prompt.length > 20 ? '...' : ''}`,
                    type: 'edit',
                    imageData: finalImageBase64,
                    visible: true,
                    opacity: 100,
                    x: processed.bounds.x,
                    y: processed.bounds.y,
                    width: processed.bounds.width,
                    height: processed.bounds.height,
                    polygonPoints: processed.relativePolygonPoints,
                });

                // Clear selection and switch to move tool
                clearSelection();
                setActiveTool('move');

                toast.success('Generation complete! New layer added.');

            } catch (err) {
                const message = err instanceof Error ? err.message : 'An unexpected error occurred';
                setError(message);
                toast.error(`Generation failed: ${message}`);
            } finally {
                setIsGenerating(false);
            }
        }
    };

    return (
        <div className="app">
            {/* Settings Modal */}
            <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

            {/* Keyboard Shortcuts Modal */}
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
                                                    onClick={async () => {
                                                        setFileMenuOpen(false);
                                                        if (file.type === 'project') {
                                                            await loadProject();
                                                        } else {
                                                            await loadImage(file.path);
                                                        }
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
                    <button className="top-bar-btn" onClick={() => setShortcutsOpen(true)}>Help</button>
                </div>
                <div className="top-bar-right">
                    <Tooltip content="Undo" shortcut="Ctrl+Z" position="bottom">
                        <button
                            className="top-bar-btn icon-btn"
                            onClick={handleUndo}
                            disabled={!canUndo()}
                            aria-label="Undo"
                        >
                            ↩
                        </button>
                    </Tooltip>
                    <Tooltip content="Redo" shortcut="Ctrl+Y" position="bottom">
                        <button
                            className="top-bar-btn icon-btn"
                            onClick={handleRedo}
                            disabled={!canRedo()}
                            aria-label="Redo"
                        >
                            ↪
                        </button>
                    </Tooltip>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="main-content">
                {/* Left Toolbar */}
                <aside className="toolbar left-toolbar">
                    <div className="tool-group">
                        <Tooltip content="Move Tool" shortcut="V" position="right" description="Select and move layers">
                            <button
                                className={`tool-btn ${activeTool === 'move' ? 'active' : ''}`}
                                onClick={() => setActiveTool('move')}
                                aria-label="Move Tool"
                            >
                                <img src="/move.svg" alt="Move" className="tool-icon" />
                            </button>
                        </Tooltip>
                        <Tooltip content="Rectangle Select" shortcut="M" position="right" description="Draw rectangular selections">
                            <button
                                className={`tool-btn ${activeTool === 'rectangle' ? 'active' : ''}`}
                                onClick={() => setActiveTool('rectangle')}
                                aria-label="Rectangle Select"
                            >
                                <img src="/rectangle.svg" alt="Rectangle" className="tool-icon" />
                            </button>
                        </Tooltip>
                        <Tooltip content="Lasso Select [BETA]" shortcut="L" position="right" description="Draw freeform selections">
                            <button
                                className={`tool-btn ${activeTool === 'lasso' ? 'active' : ''}`}
                                onClick={() => setActiveTool('lasso')}
                                aria-label="Lasso Select"
                            >
                                <img src="/lasso.svg" alt="Lasso" className="tool-icon" />
                            </button>
                        </Tooltip>
                    </div>
                    <div className="tool-divider"></div>
                    <div className="tool-group">
                        <Tooltip content="Rectangle Shape" shortcut="U" position="right" description="Draw filled rectangles">
                            <button
                                className={`tool-btn ${activeTool === 'shape-rect' ? 'active' : ''}`}
                                onClick={() => setActiveTool('shape-rect')}
                                aria-label="Rectangle Shape"
                            >
                                <img src="/shape-rect.svg" alt="Rectangle Shape" className="tool-icon" />
                            </button>
                        </Tooltip>
                        <Tooltip content="Ellipse Shape" shortcut="O" position="right" description="Draw filled ellipses">
                            <button
                                className={`tool-btn ${activeTool === 'shape-ellipse' ? 'active' : ''}`}
                                onClick={() => setActiveTool('shape-ellipse')}
                                aria-label="Ellipse Shape"
                            >
                                <img src="/shape-ellipse.svg" alt="Ellipse Shape" className="tool-icon" />
                            </button>
                        </Tooltip>
                        <Tooltip content="Shape Color" position="right" description="Click to change shape fill color">
                            <label className="color-picker-btn" style={{ backgroundColor: shapeColor }}>
                                <input
                                    type="color"
                                    value={shapeColor}
                                    onChange={(e) => setShapeColor(e.target.value)}
                                    className="color-picker-input"
                                />
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
                    <ProgressIndicator
                        visible={isGenerating}
                        message="Generating..."
                        subMessage={generationStages[generationStage]}
                        stages={getProgressStages()}
                    />
                    <ProgressIndicator
                        visible={isLoading}
                        message="Loading image..."
                        subMessage="Please wait"
                    />
                    <ProgressIndicator
                        visible={isSaving}
                        message="Saving project..."
                    />
                    <ProgressIndicator
                        visible={isExporting}
                        message="Exporting image..."
                    />

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

                            <ReferenceImages
                                images={referenceImages}
                                onChange={setReferenceImages}
                                maxImages={3}
                            />

                            {error && (
                                <div className="error-message">{error}</div>
                            )}

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

                    {/* Layer Panel */}
                    <LayerPanel />
                </aside>
            </main>

            {/* Bottom Bar */}
            <footer className="bottom-bar">
                <div className="bottom-bar-left">
                    <span className="status-text">
                        {isGenerating ? (
                            <span className="status-loading">
                                <span className="progress-spinner" />
                                {generationStages[generationStage]}...
                            </span>
                        ) : isLoading ? (
                            <span className="status-loading">
                                <span className="progress-spinner" />
                                Loading...
                            </span>
                        ) : isSaving ? (
                            <span className="status-loading">
                                <span className="progress-spinner" />
                                Saving...
                            </span>
                        ) : isExporting ? (
                            <span className="status-loading">
                                <span className="progress-spinner" />
                                Exporting...
                            </span>
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

