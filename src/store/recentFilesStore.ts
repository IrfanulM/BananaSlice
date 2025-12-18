// Recent Files Store
// Manages recently opened files with persistence

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface RecentFile {
    path: string;
    name: string;
    type: 'image' | 'project';
    timestamp: number;
}

interface RecentFilesState {
    recentFiles: RecentFile[];
    maxFiles: number;
    addRecentFile: (path: string, type: 'image' | 'project') => void;
    removeRecentFile: (path: string) => void;
    clearRecentFiles: () => void;
}

export const useRecentFilesStore = create<RecentFilesState>()(
    persist(
        (set, get) => ({
            recentFiles: [],
            maxFiles: 10,

            addRecentFile: (path, type) => {
                const { recentFiles, maxFiles } = get();

                // Extract filename from path
                const name = path.split(/[\\/]/).pop() || path;

                // Remove existing entry with same path
                const filtered = recentFiles.filter(f => f.path !== path);

                // Add new entry at the beginning
                const newFile: RecentFile = {
                    path,
                    name,
                    type,
                    timestamp: Date.now(),
                };

                let newList = [newFile, ...filtered];

                // Limit to maxFiles
                if (newList.length > maxFiles) {
                    newList = newList.slice(0, maxFiles);
                }

                set({ recentFiles: newList });
            },

            removeRecentFile: (path) => {
                set((state) => ({
                    recentFiles: state.recentFiles.filter(f => f.path !== path),
                }));
            },

            clearRecentFiles: () => {
                set({ recentFiles: [] });
            },
        }),
        {
            name: 'bananaslice-recent-files',
            partialize: (state) => ({
                recentFiles: state.recentFiles,
            }),
        }
    )
);
