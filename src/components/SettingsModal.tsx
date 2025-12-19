// Settings Modal Component
import { useState, useEffect } from 'react';
import { setApiKey, hasApiKey, deleteApiKey } from '../api';
import { Tooltip } from './Tooltip';
import { open } from '@tauri-apps/plugin-shell';
import './Modal.css';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const [apiKey, setApiKeyValue] = useState('');
    const [hasKey, setHasKey] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        if (isOpen) {
            checkApiKey();
        }
    }, [isOpen]);

    const checkApiKey = async () => {
        const exists = await hasApiKey();
        setHasKey(exists);
    };

    const handleSave = async () => {
        if (!apiKey.trim()) {
            setMessage({ type: 'error', text: 'Please enter an API key' });
            return;
        }

        setIsSaving(true);
        try {
            await setApiKey(apiKey.trim());
            setMessage({ type: 'success', text: 'API key saved successfully!' });
            setHasKey(true);
            setApiKeyValue('');
        } catch (error) {
            setMessage({ type: 'error', text: `Failed to save: ${error}` });
        }
        setIsSaving(false);
    };

    const handleDelete = async () => {
        try {
            await deleteApiKey();
            setMessage({ type: 'success', text: 'API key deleted' });
            setHasKey(false);
        } catch (error) {
            setMessage({ type: 'error', text: `Failed to delete: ${error}` });
        }
    };

    const handleOpenExternal = async (url: string) => {
        try {
            await open(url);
        } catch (error) {
            console.error('Failed to open external URL:', error);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content md" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Settings</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                <div className="modal-body">
                    <div className="settings-section">
                        <h3>Gemini API Key</h3>
                        <p className="settings-description">
                            Get your API key from{' '}
                            <button
                                className="link-btn"
                                onClick={() => handleOpenExternal('https://aistudio.google.com/app/apikey')}
                            >
                                Google AI Studio
                            </button>.
                            <br />
                            <Tooltip
                                content="How is this stored?"
                                delay={200}
                                position="bottom"
                                interactive={true}
                                description={
                                    <>
                                        BananaSlice uses your OS Native Keychain (e.g., macOS Keychain or Windows Credential Manager).
                                        Your key is encrypted via your system login.
                                        You can verify our open-source implementation{' '}
                                        <button
                                            className="link-btn"
                                            onClick={() => handleOpenExternal('https://github.com/IrfanulM/BananaSlice/blob/main/src-tauri/src/keystore.rs')}
                                            style={{ color: 'var(--primary)', textDecoration: 'underline' }}
                                        >
                                            here
                                        </button>.
                                    </>
                                }
                            >
                                <span style={{ cursor: 'help', borderBottom: '1px dotted currentColor', fontSize: '0.9em', opacity: 0.8 }}>
                                    Is my key safe?
                                </span>
                            </Tooltip>
                        </p>

                        <div className="api-key-status">
                            Status: {hasKey ? (
                                <span className="status-configured">✓ Configured</span>
                            ) : (
                                <span className="status-missing">✗ Not configured</span>
                            )}
                        </div>

                        <div className="api-key-input-group">
                            <input
                                type="password"
                                placeholder="Enter your Gemini API key..."
                                value={apiKey}
                                onChange={(e) => setApiKeyValue(e.target.value)}
                                className="api-key-input"
                            />
                            <button
                                className="modal-btn primary"
                                onClick={handleSave}
                                disabled={isSaving}
                            >
                                {isSaving ? 'Saving...' : 'Save'}
                            </button>
                        </div>

                        {hasKey && (
                            <button className="modal-btn danger" style={{ background: 'transparent', color: '#ef4444', border: '1px solid currentColor', marginTop: '12px' }} onClick={handleDelete}>
                                Delete API Key
                            </button>
                        )}

                        {message && (
                            <div className={`message ${message.type}`}>
                                {message.text}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
