// Keyboard Shortcuts Modal
// Displays all available keyboard shortcuts

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './KeyboardShortcuts.css';

interface ShortcutItem {
    label: string;
    keys: string[];
}

interface ShortcutSection {
    title: string;
    shortcuts: ShortcutItem[];
}

const shortcutSections: ShortcutSection[] = [
    {
        title: 'Tools',
        shortcuts: [
            { label: 'Move Tool', keys: ['V'] },
            { label: 'Rectangle Select', keys: ['M'] },
            { label: 'Lasso Select', keys: ['L'] },
            { label: 'Deselect', keys: ['D'] },
        ],
    },
    {
        title: 'View',
        shortcuts: [
            { label: 'Zoom In', keys: ['+'] },
            { label: 'Zoom Out', keys: ['-'] },
        ],
    },
    {
        title: 'File',
        shortcuts: [
            { label: 'Save', keys: ['Ctrl', 'S'] },
        ],
    },
    {
        title: 'Edit',
        shortcuts: [
            { label: 'Undo', keys: ['Ctrl', 'Z'] },
            { label: 'Redo', keys: ['Ctrl', 'Y'] },
            { label: 'Redo (Alt)', keys: ['Ctrl', 'Shift', 'Z'] },
        ],
    },
    {
        title: 'Canvas',
        shortcuts: [
            { label: 'Pan', keys: ['Middle Mouse'] },
            { label: 'Pan (Alt)', keys: ['Shift', 'Drag'] },
            { label: 'Zoom', keys: ['Scroll Wheel'] },
        ],
    },
];

interface KeyboardShortcutsProps {
    isOpen: boolean;
    onClose: () => void;
}

export function KeyboardShortcuts({ isOpen, onClose }: KeyboardShortcutsProps) {
    useEffect(() => {
        if (isOpen) {
            const handleKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    onClose();
                }
            };
            document.addEventListener('keydown', handleKeyDown);
            return () => document.removeEventListener('keydown', handleKeyDown);
        }
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return createPortal(
        <div className="shortcuts-modal-overlay" onClick={onClose}>
            <div
                className="shortcuts-modal"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="shortcuts-title"
            >
                <div className="shortcuts-modal-header">
                    <h2 id="shortcuts-title">Keyboard Shortcuts</h2>
                    <button
                        className="shortcuts-modal-close"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        ×
                    </button>
                </div>
                <div className="shortcuts-modal-body">
                    {shortcutSections.map((section) => (
                        <div key={section.title} className="shortcuts-section">
                            <h3 className="shortcuts-section-title">{section.title}</h3>
                            <div className="shortcuts-list">
                                {section.shortcuts.map((shortcut) => (
                                    <div key={shortcut.label} className="shortcut-item">
                                        <span className="shortcut-label">{shortcut.label}</span>
                                        <div className="shortcut-keys">
                                            {shortcut.keys.map((key, index) => (
                                                <span key={key}>
                                                    <span className="shortcut-key">{key}</span>
                                                    {index < shortcut.keys.length - 1 && (
                                                        <span className="shortcut-plus"> + </span>
                                                    )}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>,
        document.body
    );
}
