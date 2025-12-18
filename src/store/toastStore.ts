// Toast Store
// Manages toast notifications state

import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
    id: string;
    type: ToastType;
    message: string;
    duration?: number; // ms, default 4000
}

interface ToastState {
    toasts: Toast[];
    addToast: (toast: Omit<Toast, 'id'>) => void;
    removeToast: (id: string) => void;
    clearAll: () => void;
}

let toastId = 0;

export const useToastStore = create<ToastState>((set, get) => ({
    toasts: [],

    addToast: (toast) => {
        const id = `toast-${++toastId}`;
        const newToast: Toast = {
            id,
            duration: 4000,
            ...toast,
        };

        set((state) => ({
            toasts: [...state.toasts, newToast],
        }));

        // Auto-remove after duration
        if (newToast.duration && newToast.duration > 0) {
            setTimeout(() => {
                get().removeToast(id);
            }, newToast.duration);
        }
    },

    removeToast: (id) => {
        set((state) => ({
            toasts: state.toasts.filter((t) => t.id !== id),
        }));
    },

    clearAll: () => {
        set({ toasts: [] });
    },
}));

// Helper functions for common toast types
export const toast = {
    success: (message: string) => useToastStore.getState().addToast({ type: 'success', message }),
    error: (message: string) => useToastStore.getState().addToast({ type: 'error', message, duration: 6000 }),
    info: (message: string) => useToastStore.getState().addToast({ type: 'info', message }),
    warning: (message: string) => useToastStore.getState().addToast({ type: 'warning', message, duration: 5000 }),
};
