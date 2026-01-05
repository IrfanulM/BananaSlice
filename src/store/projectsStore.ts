// Projects Store - Multi-tab project management
// Handles multiple open projects with isolated state

import { create } from 'zustand';
import { useCanvasStore } from './canvasStore';
import { useLayerStore } from './layerStore';
import { useHistoryStore, type HistorySnapshot } from './historyStore';
import { useSelectionStore } from './selectionStore';
import type { Layer } from '../types';

// Complete snapshot of a project's state
export interface ProjectSnapshot {
    id: string;
    name: string;
    createdAt: number;
    
    // Canvas state
    baseImage: {
        data: string;
        width: number;
        height: number;
        format: string;
    } | null;
    imagePath: string | null;
    zoom: number;
    panX: number;
    panY: number;
    
    // Layer state
    layers: Layer[];
    activeLayerId: string | null;
    
    // History state
    historyPast: HistorySnapshot[];
    historyFuture: HistorySnapshot[];
    isDirty: boolean;
    
}

interface ProjectsState {
    projects: Map<string, ProjectSnapshot>;
    activeProjectId: string | null;
    tabOrder: string[];
    
    createProject: (name?: string, fromDrop?: boolean) => string;
    closeProject: (id: string) => boolean;
    switchProject: (id: string) => void;
    saveCurrentProjectState: () => void;
    updateProjectName: (id: string, name: string) => void;
    getActiveProject: () => ProjectSnapshot | null;
    getProjectById: (id: string) => ProjectSnapshot | null;
    hasUnsavedChanges: (id: string) => boolean;
    forceCloseProject: (id: string) => void;
    findProjectByPath: (filePath: string) => string | null;
}

// Generate unique project ID
const generateProjectId = (): string => {
    return `project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Create empty project snapshot
const createEmptySnapshot = (id: string, name: string): ProjectSnapshot => ({
    id,
    name,
    createdAt: Date.now(),
    baseImage: null,
    imagePath: null,
    zoom: 100,
    panX: 0,
    panY: 0,
    layers: [],
    activeLayerId: null,
    historyPast: [],
    historyFuture: [],
    isDirty: false,
});

const captureCurrentState = (id: string, name: string): ProjectSnapshot => {
    const canvasState = useCanvasStore.getState();
    const layerState = useLayerStore.getState();
    const historyState = useHistoryStore.getState();
    
    return {
        id,
        name,
        createdAt: Date.now(),
        baseImage: canvasState.baseImage,
        imagePath: canvasState.imagePath,
        zoom: canvasState.zoom,
        panX: canvasState.panX,
        panY: canvasState.panY,
        layers: layerState.layers,
        activeLayerId: layerState.activeLayerId,
        historyPast: historyState.past,
        historyFuture: historyState.future,
        isDirty: historyState.isDirty,
    };
};

// Restore state to all stores from snapshot
const restoreStateFromSnapshot = (snapshot: ProjectSnapshot) => {
    const canvasStore = useCanvasStore.getState();
    const layerStore = useLayerStore.getState();
    const historyStore = useHistoryStore.getState();
    const selectionStore = useSelectionStore.getState();
    
    // Restore canvas state
    if (snapshot.baseImage) {
        canvasStore.setBaseImage(snapshot.baseImage, snapshot.imagePath || '');
    } else {
        canvasStore.clearImage();
    }
    canvasStore.setZoom(snapshot.zoom);
    canvasStore.setPan(snapshot.panX, snapshot.panY);
    
    // Restore layer state
    if (snapshot.layers.length > 0) {
        layerStore.restoreLayers(snapshot.layers, snapshot.activeLayerId);
    } else {
        layerStore.clearLayers();
    }
    
    // Restore history state
    historyStore.restoreState(snapshot.historyPast, snapshot.historyFuture, snapshot.isDirty);
    
    // Clear selection
    selectionStore.clearSelection();
};

// Clear all stores (for new empty project)
const clearAllStores = () => {
    useCanvasStore.getState().clearImage();
    useLayerStore.getState().clearLayers();
    useHistoryStore.getState().reset();
    useSelectionStore.getState().clearSelection();
};

export const useProjectsStore = create<ProjectsState>((set, get) => ({
    projects: new Map(),
    activeProjectId: null,
    tabOrder: [],
    
    createProject: (name?: string, fromDrop?: boolean) => {
        const id = generateProjectId();
        const projectName = name || 'Untitled';
        const { activeProjectId, tabOrder } = get();
        
        if (activeProjectId) {
            get().saveCurrentProjectState();
        }
        
        // Set activeProjectId to null BEFORE clearing stores
        // This prevents the imagePath subscription from corrupting the saved project
        set({ activeProjectId: null });
        
        if (!fromDrop) {
            clearAllStores();
        }
        
        const newProject = createEmptySnapshot(id, projectName);
        
        set(state => {
            const newProjects = new Map(state.projects);
            newProjects.set(id, newProject);
            return {
                projects: newProjects,
                activeProjectId: id,
                tabOrder: [...tabOrder, id],
            };
        });
        
        return id;
    },
    
    closeProject: (id: string) => {
        const { projects, activeProjectId } = get();
        const project = projects.get(id);
        
        if (!project) return true;

        const isProjectDirty = (id === activeProjectId)
            ? useHistoryStore.getState().isDirty
            : project.isDirty;
        
        if (isProjectDirty) {
            return false;
        }
        
        get().forceCloseProject(id);
        return true;
    },
    
    forceCloseProject: (id: string) => {
        const { activeProjectId, tabOrder, projects } = get();
        
        // Find index in tab order
        const tabIndex = tabOrder.indexOf(id);
        
        // Remove from projects and tab order
        const newProjects = new Map(projects);
        newProjects.delete(id);
        const newTabOrder = tabOrder.filter(tid => tid !== id);
        
        // Determine new active project
        let newActiveId: string | null = null;
        if (newTabOrder.length > 0) {
            if (id === activeProjectId) {
                // Switch to adjacent tab
                const newIndex = Math.min(tabIndex, newTabOrder.length - 1);
                newActiveId = newTabOrder[newIndex];
            } else {
                newActiveId = activeProjectId;
            }
        }
        
        // If we are changing the active project or clearing everything
        if (newActiveId !== activeProjectId) {
            // Set to null first to disable subscriptions
            set({ activeProjectId: null });
            
            if (newActiveId) {
                const newActiveProject = newProjects.get(newActiveId);
                if (newActiveProject) {
                    restoreStateFromSnapshot(newActiveProject);
                }
            } else {
                clearAllStores();
            }
        }
        
        set({
            projects: newProjects,
            tabOrder: newTabOrder,
            activeProjectId: newActiveId,
        });
    },
    
    switchProject: (id: string) => {
        const { activeProjectId, projects } = get();
        
        if (id === activeProjectId) return;
        
        const targetProject = projects.get(id);
        if (!targetProject) return;
        
        // Save current project state
        if (activeProjectId) {
            get().saveCurrentProjectState();
        }
        
        // Switch to target project
        set({ activeProjectId: id });
        
        // Restore target project's state
        restoreStateFromSnapshot(targetProject);
    },
    
    saveCurrentProjectState: () => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        
        const currentProject = projects.get(activeProjectId);
        if (!currentProject) return;
        
        // Capture current state
        const updatedSnapshot = captureCurrentState(activeProjectId, currentProject.name);
        
        set(state => {
            const newProjects = new Map(state.projects);
            newProjects.set(activeProjectId, updatedSnapshot);
            return { projects: newProjects };
        });
    },
    
    updateProjectName: (id: string, name: string) => {
        set(state => {
            const project = state.projects.get(id);
            if (!project) return state;
            
            const newProjects = new Map(state.projects);
            newProjects.set(id, { ...project, name });
            return { projects: newProjects };
        });
    },
    
    getActiveProject: () => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return null;
        return projects.get(activeProjectId) || null;
    },
    
    getProjectById: (id: string) => {
        return get().projects.get(id) || null;
    },
    
    hasUnsavedChanges: (id: string) => {
        const { activeProjectId } = get();
        
        // For active project, check live state
        if (id === activeProjectId) {
            return useHistoryStore.getState().isDirty;
        }
        
        // For inactive projects, check snapshot
        const project = get().projects.get(id);
        return project?.isDirty || false;
    },
    
    findProjectByPath: (filePath: string) => {
        const normalizedPath = filePath.toLowerCase().replace(/\\/g, '/');
        const { projects, activeProjectId } = get();
        
        // Also check current live state for active project
        const currentImagePath = useCanvasStore.getState().imagePath;
        if (activeProjectId && currentImagePath) {
            const normalizedCurrent = currentImagePath.toLowerCase().replace(/\\/g, '/');
            if (normalizedCurrent === normalizedPath) {
                return activeProjectId;
            }
        }
        
        // Check all stored project snapshots
        for (const [id, project] of projects) {
            if (project.imagePath) {
                const normalizedProjectPath = project.imagePath.toLowerCase().replace(/\\/g, '/');
                if (normalizedProjectPath === normalizedPath) {
                    return id;
                }
            }
        }
        return null;
    },
}));

// Sync isDirty changes from history store to projects store
useHistoryStore.subscribe(
    (state) => state.isDirty,
    (isDirty) => {
        const { activeProjectId, projects } = useProjectsStore.getState();
        if (!activeProjectId) return;
        
        const project = projects.get(activeProjectId);
        if (project && project.isDirty !== isDirty) {
            const newProjects = new Map(projects);
            newProjects.set(activeProjectId, { ...project, isDirty });
            useProjectsStore.setState({ projects: newProjects });
        }
    }
);

// Sync imagePath changes from canvas store to projects store
let previousImagePath: string | null = null;
useCanvasStore.subscribe((state) => {
    if (state.imagePath !== previousImagePath) {
        previousImagePath = state.imagePath;
        
        const { activeProjectId, projects } = useProjectsStore.getState();
        if (!activeProjectId) return;
        
        const project = projects.get(activeProjectId);
        if (project && project.imagePath !== state.imagePath) {
            const newProjects = new Map(projects);
            newProjects.set(activeProjectId, { ...project, imagePath: state.imagePath });
            useProjectsStore.setState({ projects: newProjects });
        }
    }
});

// Helper to normalize file paths for comparison (case-insensitive on Windows)
export const normalizePath = (path: string): string => {
    return path.toLowerCase().replace(/\\/g, '/');
};
