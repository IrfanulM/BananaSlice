// Settings Store
// Manages application settings

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AIModel } from '../types';

interface SettingsState {
    // API settings
    apiKeySet: boolean; // True if key is stored in OS keychain

    // Default model
    defaultModel: AIModel;

    // Custom API configuration
    baseUrl: string;
    customModel: string;

    // Actions
    setApiKeySet: (set: boolean) => void;
    setDefaultModel: (model: AIModel) => void;
    setBaseUrl: (url: string) => void;
    setCustomModel: (model: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            // Initial state
            apiKeySet: false,
            defaultModel: 'nano-banana-pro',
            baseUrl: '',
            customModel: '',

            // Actions
            setApiKeySet: (apiKeySet) => set({ apiKeySet }),
            setDefaultModel: (defaultModel) => set({ defaultModel }),
            setBaseUrl: (baseUrl) => set({ baseUrl }),
            setCustomModel: (customModel) => set({ customModel }),
        }),
        {
            name: 'bananaslice-settings',
            partialize: (state) => ({
                defaultModel: state.defaultModel,
                apiKeySet: state.apiKeySet,
                baseUrl: state.baseUrl,
                customModel: state.customModel,
            }),
        }
    )
);
