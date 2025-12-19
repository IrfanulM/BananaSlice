// Keyboard Shortcuts Modal
// Displays all available keyboard shortcuts

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';

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
            { label: 'Rectangle Shape', keys: ['U'] },
            { label: 'Ellipse Shape', keys: ['O'] },
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
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal-content md"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="shortcuts-title"
            >
                <div className="modal-header">
                    <h2 className="modal-title" id="shortcuts-title">Keyboard Shortcuts</h2>
                    <button
                        className="modal-close"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        ×
                    </button>
                </div>
                <div className="modal-body">
                    {shortcutSections.map((section) => (
                        <div key={section.title} className="modal-section">
                            <h3 className="modal-section-title">{section.title}</h3>
                            <div className="modal-list">
                                {section.shortcuts.map((shortcut) => (
                                    <div key={shortcut.label} className="modal-list-item">
                                        <span className="modal-item-label">{shortcut.label}</span>
                                        <div className="modal-keys">
                                            {shortcut.keys.map((key, index) => (
                                                <span key={key} style={{ display: 'flex', alignItems: 'center' }}>
                                                    <span className="modal-key">{key}</span>
                                                    {index < shortcut.keys.length - 1 && (
                                                        <span className="modal-key-separator">+</span>
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
