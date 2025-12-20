// Context Toolbar Component
// Floating toolbar that appears below selected layers for contextual controls

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLayerStore } from '../store/layerStore';
import './ContextToolbar.css';

interface ContextToolbarProps {
    /** Screen coordinates of the selected layer's bounding box */
    layerBounds: {
        left: number;
        top: number;
        width: number;
        height: number;
    } | null;
    /** ID of the currently selected layer */
    layerId: string | null;
}

export function ContextToolbar({ layerBounds, layerId }: ContextToolbarProps) {
    const [visible, setVisible] = useState(false);
    // Subscribe to layers array for reactivity - when any layer changes, this re-renders
    const layers = useLayerStore((state) => state.layers);
    const setFeatherRadius = useLayerStore((state) => state.setFeatherRadius);
    const timeoutRef = useRef<number | null>(null);

    // Derive the specific layer from the subscribed layers array
    const layer = layerId ? layers.find(l => l.id === layerId) : undefined;

    // Don't show for base layer
    const shouldShow = layerBounds && layer && layer.type !== 'base';

    // Animate in after mount
    useEffect(() => {
        if (shouldShow) {
            timeoutRef.current = window.setTimeout(() => {
                setVisible(true);
            }, 50);
        } else {
            setVisible(false);
        }

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [shouldShow]);

    if (!shouldShow || !layer) {
        return null;
    }

    // Get current feather value (default to 0 if not set)
    const featherValue = layer.featherRadius ?? 0;

    // Position below the layer with a small gap
    const toolbarTop = layerBounds.top + layerBounds.height + 12;
    const toolbarLeft = layerBounds.left + layerBounds.width / 2;

    const handleFeatherChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value, 10);
        setFeatherRadius(layer.id, value);
    };

    const toolbarContent = (
        <div
            className="context-toolbar-portal"
            style={{
                top: toolbarTop,
                left: toolbarLeft,
            }}
        >
            <div className={`context-toolbar ${visible ? 'visible' : ''}`}>
                <span className="context-toolbar-label">Feather</span>
                <div className="context-toolbar-slider-group">
                    <input
                        type="range"
                        className="context-toolbar-slider"
                        min="0"
                        max="50"
                        value={featherValue}
                        onChange={handleFeatherChange}
                        onInput={handleFeatherChange}
                    />
                    <span className="context-toolbar-value">{featherValue}px</span>
                </div>
            </div>
        </div>
    );

    return createPortal(toolbarContent, document.body);
}
