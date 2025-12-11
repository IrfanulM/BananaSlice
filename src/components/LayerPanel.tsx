// LayerPanel - Layer stack management UI
import { useState } from 'react';
import { useLayerStore } from '../store/layerStore';
import './LayerPanel.css';

interface LayerPanelProps {
    className?: string;
    onLayerChange?: () => void;
}

export function LayerPanel({ className = '', onLayerChange }: LayerPanelProps) {
    const {
        layers,
        activeLayerId,
        setActiveLayer,
        toggleVisibility,
        setOpacity,
        moveLayerUp,
        moveLayerDown,
        removeLayer,
        renameLayer,
        duplicateLayer,
    } = useLayerStore();

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    // Display layers in reverse order (top to bottom visually)
    const displayLayers = [...layers].reverse();

    const handleStartRename = (id: string, currentName: string) => {
        setEditingId(id);
        setEditName(currentName);
    };

    const handleFinishRename = (id: string) => {
        if (editName.trim()) {
            renameLayer(id, editName.trim());
        }
        setEditingId(null);
        setEditName('');
    };

    const handleVisibilityToggle = (id: string) => {
        toggleVisibility(id);
        onLayerChange?.();
    };

    const handleOpacityChange = (id: string, value: number) => {
        setOpacity(id, value);
        onLayerChange?.();
    };

    const handleDelete = (id: string) => {
        removeLayer(id);
        onLayerChange?.();
    };

    const handleDuplicate = (id: string) => {
        duplicateLayer(id);
        onLayerChange?.();
    };

    const isBaseLayer = (type: string) => type === 'base';

    return (
        <div className={`layer-panel ${className}`}>
            <div className="layer-panel-header">
                <h3>Layers</h3>
                <span className="layer-count">{layers.length}</span>
            </div>

            <div className="layer-list">
                {displayLayers.length === 0 ? (
                    <div className="layer-empty">No layers</div>
                ) : (
                    displayLayers.map((layer) => (
                        <div
                            key={layer.id}
                            className={`layer-item ${activeLayerId === layer.id ? 'active' : ''} ${!layer.visible && !isBaseLayer(layer.type) ? 'hidden-layer' : ''}`}
                            onClick={() => setActiveLayer(layer.id)}
                        >
                            {/* Visibility toggle - only for non-base layers */}
                            {isBaseLayer(layer.type) ? (
                                <div className="layer-visibility-placeholder">🔒</div>
                            ) : (
                                <button
                                    className={`layer-visibility ${layer.visible ? 'visible' : 'hidden'}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleVisibilityToggle(layer.id);
                                    }}
                                    title={layer.visible ? 'Hide layer' : 'Show layer'}
                                >
                                    {layer.visible ? '👁' : '○'}
                                </button>
                            )}

                            {/* Layer thumbnail */}
                            <div className="layer-thumbnail">
                                {layer.imageData && (
                                    <img
                                        src={`data:image/png;base64,${layer.imageData}`}
                                        alt={layer.name}
                                    />
                                )}
                            </div>

                            {/* Layer info */}
                            <div className="layer-info">
                                {editingId === layer.id ? (
                                    <input
                                        type="text"
                                        className="layer-name-input"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        onBlur={() => handleFinishRename(layer.id)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleFinishRename(layer.id);
                                            if (e.key === 'Escape') setEditingId(null);
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        autoFocus
                                    />
                                ) : (
                                    <span
                                        className="layer-name"
                                        onDoubleClick={(e) => {
                                            e.stopPropagation();
                                            if (!isBaseLayer(layer.type)) {
                                                handleStartRename(layer.id, layer.name);
                                            }
                                        }}
                                        title={isBaseLayer(layer.type) ? 'Background layer' : 'Double-click to rename'}
                                    >
                                        {isBaseLayer(layer.type) ? 'Base' : layer.name}
                                    </span>
                                )}
                                <span className="layer-type">
                                    {isBaseLayer(layer.type) ? 'Background' : 'Edit'}
                                    {layer.x !== undefined && !isBaseLayer(layer.type) && ` (${layer.x}, ${layer.y})`}
                                </span>
                            </div>

                            {/* Opacity slider - only for non-base layers */}
                            {!isBaseLayer(layer.type) && (
                                <div className="layer-opacity">
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={layer.opacity}
                                        onChange={(e) => handleOpacityChange(layer.id, parseInt(e.target.value))}
                                        onClick={(e) => e.stopPropagation()}
                                        title={`Opacity: ${layer.opacity}%`}
                                    />
                                    <span className="opacity-value">{layer.opacity}%</span>
                                </div>
                            )}

                            {/* Layer actions - only for non-base layers */}
                            {!isBaseLayer(layer.type) && (
                                <div className="layer-actions">
                                    <button
                                        className="layer-action"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            moveLayerUp(layer.id);
                                            onLayerChange?.();
                                        }}
                                        disabled={layer.order === layers.length - 1}
                                        title="Move up"
                                    >
                                        ↑
                                    </button>
                                    <button
                                        className="layer-action"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            moveLayerDown(layer.id);
                                            onLayerChange?.();
                                        }}
                                        disabled={layer.order === 1} // Can't go below base layer
                                        title="Move down"
                                    >
                                        ↓
                                    </button>
                                    <button
                                        className="layer-action"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDuplicate(layer.id);
                                        }}
                                        title="Duplicate layer"
                                    >
                                        ⎘
                                    </button>
                                    <button
                                        className="layer-action delete"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(layer.id);
                                        }}
                                        title="Delete layer"
                                    >
                                        ×
                                    </button>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}


