// LayerPanel - Layer stack management UI using @hello-pangea/dnd for robust reordering
import { useState } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { useLayerStore } from '../store/layerStore';
import { Tooltip } from './Tooltip';
import './LayerPanel.css';

interface LayerPanelProps {
    className?: string;
}

export function LayerPanel({ className = '' }: LayerPanelProps) {
    const {
        layers,
        activeLayerId,
        setActiveLayer,
        toggleVisibility,
        setOpacity,
        removeLayer,
        renameLayer,
        duplicateLayer,
        reorderLayers,
    } = useLayerStore();

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    // Display layers in reverse order (top to bottom visually)
    const displayLayers = [...layers].reverse();

    const onDragEnd = (result: DropResult) => {
        const { destination, source } = result;

        if (!destination) return;
        if (destination.index === source.index) return;

        // Custom logic: don't allow reordering involving the base layer
        if (isBaseLayer(displayLayers[source.index].type) || isBaseLayer(displayLayers[destination.index].type)) {
            return;
        }

        // Convert display indices (which are reversed) to store indices
        const actualFrom = layers.length - 1 - source.index;
        const actualTo = layers.length - 1 - destination.index;

        reorderLayers(actualFrom, actualTo);
    };

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
    };

    const handleOpacityChange = (id: string, value: number) => {
        setOpacity(id, value);
    };

    const handleDelete = (id: string) => {
        removeLayer(id);
    };

    const handleDuplicate = (id: string) => {
        duplicateLayer(id);
    };

    const isBaseLayer = (type: string) => type === 'base';

    return (
        <div className={`layer-panel ${className}`}>
            <div className="layer-panel-header">
                <h3>Layers</h3>
                <span className="layer-count">{layers.length}</span>
            </div>

            <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="layer-list">
                    {(provided) => (
                        <div
                            className="layer-list"
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                        >
                            {displayLayers.length === 0 ? (
                                <div className="layer-empty">No layers</div>
                            ) : (
                                displayLayers.map((layer, index) => (
                                    <Draggable
                                        key={layer.id}
                                        draggableId={layer.id}
                                        index={index}
                                        isDragDisabled={isBaseLayer(layer.type)}
                                    >
                                        {(provided, snapshot) => (
                                            <div
                                                ref={provided.innerRef}
                                                {...provided.draggableProps}
                                                {...provided.dragHandleProps}
                                                className={`layer-item ${activeLayerId === layer.id ? 'active' : ''} ${!layer.visible && !isBaseLayer(layer.type) ? 'hidden-layer' : ''} ${snapshot.isDragging ? 'dragging' : ''}`}
                                                onClick={() => setActiveLayer(layer.id)}
                                                style={{
                                                    ...provided.draggableProps.style,
                                                }}
                                            >
                                                {/* Visibility toggle */}
                                                {isBaseLayer(layer.type) ? (
                                                    <Tooltip content="Background layer (locked)" position="right">
                                                        <div className="layer-visibility-placeholder"><img src="/lock.svg" alt="Locked" className="visibility-icon" /></div>
                                                    </Tooltip>
                                                ) : (
                                                    <Tooltip content={layer.visible ? 'Hide layer' : 'Show layer'} position="right">
                                                        <button
                                                            className={`layer-visibility ${layer.visible ? 'visible' : 'hidden'}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleVisibilityToggle(layer.id);
                                                            }}
                                                        >
                                                            <img src={layer.visible ? '/eye_visible.svg' : '/eye_invisible.svg'} alt={layer.visible ? 'Visible' : 'Hidden'} className="visibility-icon" />
                                                        </button>
                                                    </Tooltip>
                                                )}

                                                {/* Thumbnail */}
                                                <div className="layer-thumbnail">
                                                    {layer.imageData && (
                                                        <img
                                                            src={`data:image/png;base64,${layer.imageData}`}
                                                            alt={layer.name}
                                                            draggable="false"
                                                        />
                                                    )}
                                                </div>

                                                {/* Name and info */}
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
                                                        >
                                                            {isBaseLayer(layer.type) ? 'Base' : layer.name}
                                                        </span>
                                                    )}
                                                    <span className="layer-type">
                                                        {isBaseLayer(layer.type) ? 'Background' : 'Edit'}
                                                        {layer.x !== undefined && !isBaseLayer(layer.type) && ` (${layer.x}, ${layer.y})`}
                                                    </span>
                                                </div>

                                                {/* Opacity */}
                                                {!isBaseLayer(layer.type) && (
                                                    <Tooltip content={`Opacity: ${layer.opacity}%`} position="left">
                                                        <div className="layer-opacity">
                                                            <input
                                                                type="range"
                                                                min="0"
                                                                max="100"
                                                                value={layer.opacity}
                                                                onChange={(e) => handleOpacityChange(layer.id, parseInt(e.target.value))}
                                                                onClick={(e) => e.stopPropagation()}
                                                            />
                                                            <span className="opacity-value">{layer.opacity}%</span>
                                                        </div>
                                                    </Tooltip>
                                                )}

                                                {/* Actions */}
                                                {!isBaseLayer(layer.type) && (
                                                    <div className="layer-actions">
                                                        <Tooltip content="Duplicate layer" position="top">
                                                            <button
                                                                className="layer-action"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDuplicate(layer.id);
                                                                }}
                                                            >
                                                                <img src="/duplicate.svg" alt="Duplicate" className="action-icon" />
                                                            </button>
                                                        </Tooltip>
                                                        <Tooltip content="Delete layer" position="top">
                                                            <button
                                                                className="layer-action delete"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDelete(layer.id);
                                                                }}
                                                            >
                                                                ×
                                                            </button>
                                                        </Tooltip>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </Draggable>
                                ))
                            )}
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>
        </div>
    );
}
