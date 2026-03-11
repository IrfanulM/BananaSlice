// Update Dialog - checks for updates on boot and prompts the user
import { useState, useEffect } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

interface UpdateInfo {
    version: string;
    body: string;
}

export function UpdateDialog() {
    const [update, setUpdate] = useState<any>(null);
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [progress, setProgress] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        // Check for updates silently on startup
        const checkForUpdate = async () => {
            try {
                const result = await check();
                if (result?.available) {
                    setUpdate(result);
                    setUpdateInfo({
                        version: result.version,
                        body: result.body || '',
                    });
                }
            } catch (e) {
                // Silently fail - don't bother the user if update check fails
                console.warn('Update check failed:', e);
            }
        };

        // Small delay so it doesn't interfere with boot
        const timer = setTimeout(checkForUpdate, 3000);
        return () => clearTimeout(timer);
    }, []);

    const handleUpdate = async () => {
        if (!update) return;
        setDownloading(true);
        setError('');

        try {
            await update.downloadAndInstall((event: any) => {
                if (event.event === 'Started') {
                    const total = event.data.contentLength;
                    setProgress(total ? `0 / ${(total / 1024 / 1024).toFixed(1)} MB` : 'Downloading...');
                } else if (event.event === 'Progress') {
                    // Just show "Downloading..."
                    setProgress('Downloading...');
                } else if (event.event === 'Finished') {
                    setProgress('Installing...');
                }
            });

            // Relaunch the app after install
            await relaunch();
        } catch (e: any) {
            setError(e?.message || 'Update failed');
            setDownloading(false);
        }
    };

    // Don't render anything if no update available
    if (!updateInfo) return null;

    return (
        <div className="update-overlay">
            <div className="update-dialog">
                <div className="update-header">
                    <span className="update-icon">🔄</span>
                    <h3>Update Available</h3>
                </div>

                <p className="update-version">
                    v{updateInfo.version} is ready to install
                </p>

                {updateInfo.body && (
                    <div className="update-notes">
                        <p>{updateInfo.body}</p>
                    </div>
                )}

                {error && (
                    <p className="update-error">{error}</p>
                )}

                <div className="update-actions">
                    {downloading ? (
                        <div className="update-progress">{progress}</div>
                    ) : (
                        <>
                            <button
                                className="update-btn-skip"
                                onClick={() => setUpdateInfo(null)}
                            >
                                Later
                            </button>
                            <button
                                className="update-btn-install"
                                onClick={handleUpdate}
                            >
                                Update Now
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
