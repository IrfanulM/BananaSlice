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

    // Actions
    setApiKeySet: (set: boolean) => void;
    setDefaultModel: (model: AIModel) => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            // Initial state
            apiKeySet: false,
            defaultModel: 'nano-banana-2',

            // Actions
            setApiKeySet: (apiKeySet) => set({ apiKeySet }),
            setDefaultModel: (defaultModel) => set({ defaultModel }),
        }),
        {
            name: 'bananaslice-settings',
            partialize: (state) => ({
                defaultModel: state.defaultModel,
                apiKeySet: state.apiKeySet,
            }),
        }
    )
);
