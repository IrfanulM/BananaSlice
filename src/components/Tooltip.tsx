// Tooltip Component
// Provides accessible tooltips with keyboard shortcuts and descriptions

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './Tooltip.css';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
    /** The element that triggers the tooltip */
    children: ReactNode;
    /** Main tooltip text */
    content: string;
    /** Optional keyboard shortcut to display */
    shortcut?: string;
    /** Optional description for more details */
    description?: string;
    /** Position of the tooltip relative to the trigger */
    position?: TooltipPosition;
    /** Delay before showing tooltip (ms) */
    delay?: number;
    /** Whether tooltip is disabled */
    disabled?: boolean;
}

export function Tooltip({
    children,
    content,
    shortcut,
    description,
    position = 'top',
    delay = 400,
    disabled = false,
}: TooltipProps) {
    const [visible, setVisible] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<number | null>(null);

    const showTooltip = () => {
        if (disabled) return;

        timeoutRef.current = window.setTimeout(() => {
            if (triggerRef.current) {
                const rect = triggerRef.current.getBoundingClientRect();

                let top = 0;
                let left = 0;

                // Calculate position based on variant
                switch (position) {
                    case 'top':
                        top = rect.top - 8;
                        left = rect.left + rect.width / 2;
                        break;
                    case 'bottom':
                        top = rect.bottom + 8;
                        left = rect.left + rect.width / 2;
                        break;
                    case 'left':
                        top = rect.top + rect.height / 2;
                        left = rect.left - 8;
                        break;
                    case 'right':
                        top = rect.top + rect.height / 2;
                        left = rect.right + 8;
                        break;
                }

                setCoords({ top, left });
                setVisible(true);
            }
        }, delay);
    };

    const hideTooltip = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        setVisible(false);
    };

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    const hasMultipleLines = !!description;

    const tooltipContent = (
        <div
            ref={tooltipRef}
            className={`tooltip ${position} ${visible ? 'visible' : ''} ${hasMultipleLines ? 'multiline' : ''}`}
            style={{
                position: 'fixed',
                top: position === 'top' ? coords.top : position === 'bottom' ? coords.top : coords.top,
                left: coords.left,
                transform: position === 'top'
                    ? `translateX(-50%) translateY(-100%)`
                    : position === 'bottom'
                        ? `translateX(-50%)`
                        : position === 'left'
                            ? `translateX(-100%) translateY(-50%)`
                            : `translateY(-50%)`,
            }}
            role="tooltip"
        >
            <span className="tooltip-title">{content}</span>
            {shortcut && <span className="tooltip-shortcut">{shortcut}</span>}
            {description && <span className="tooltip-description">{description}</span>}
        </div>
    );

    return (
        <div
            ref={triggerRef}
            className="tooltip-wrapper"
            onMouseEnter={showTooltip}
            onMouseLeave={hideTooltip}
            onFocus={showTooltip}
            onBlur={hideTooltip}
        >
            {children}
            {createPortal(tooltipContent, document.body)}
        </div>
    );
}

// Simple tooltip for native title replacement (no portal, simpler styling)
interface SimpleTooltipProps {
    children: ReactNode;
    content: string;
    shortcut?: string;
    position?: TooltipPosition;
}

export function SimpleTooltip({ children, content, shortcut, position = 'top' }: SimpleTooltipProps) {
    const [visible, setVisible] = useState(false);
    const timeoutRef = useRef<number | null>(null);

    const showTooltip = () => {
        timeoutRef.current = window.setTimeout(() => {
            setVisible(true);
        }, 400);
    };

    const hideTooltip = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        setVisible(false);
    };

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    return (
        <div
            className="tooltip-wrapper"
            onMouseEnter={showTooltip}
            onMouseLeave={hideTooltip}
        >
            {children}
            <div className={`tooltip ${position} ${visible ? 'visible' : ''}`} role="tooltip">
                <span className="tooltip-title">{content}</span>
                {shortcut && <span className="tooltip-shortcut">{shortcut}</span>}
            </div>
        </div>
    );
}
