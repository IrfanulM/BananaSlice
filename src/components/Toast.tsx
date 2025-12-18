// Toast Component
// Displays toast notifications for user feedback

import { useToastStore, type ToastType } from '../store/toastStore';
import './Toast.css';

const icons: Record<ToastType, string> = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
};

export function ToastContainer() {
    const { toasts, removeToast } = useToastStore();

    if (toasts.length === 0) return null;

    return (
        <div className="toast-container" role="region" aria-label="Notifications">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={`toast ${toast.type}`}
                    role="alert"
                    aria-live="polite"
                >
                    <span className="toast-icon" aria-hidden="true">
                        {icons[toast.type]}
                    </span>
                    <div className="toast-content">
                        <p className="toast-message">{toast.message}</p>
                    </div>
                    <button
                        className="toast-close"
                        onClick={() => removeToast(toast.id)}
                        aria-label="Dismiss notification"
                    >
                        ×
                    </button>
                </div>
            ))}
        </div>
    );
}
