// Tab Bar Component
// Shows tabs for each open project with close buttons

import { useProjectsStore } from '../store/projectsStore';
import { useHistoryStore } from '../store/historyStore';
import { useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import { toast } from '../store/toastStore';
import './TabBar.css';

interface TabBarProps {
    isGenerating?: boolean;
}

export function TabBar({ isGenerating = false }: TabBarProps) {
    const { tabOrder, activeProjectId, projects, switchProject, closeProject, forceCloseProject, createProject } = useProjectsStore();
    const [closeConfirmId, setCloseConfirmId] = useState<string | null>(null);
    
    if (tabOrder.length === 0) {
        return null;
    }
    
    const handleTabClick = (id: string) => {
        if (id !== activeProjectId) {
            if (isGenerating) {
                toast.warning('Cannot switch tabs while generating');
                return;
            }
            switchProject(id);
        }
    };
    
    const handleCloseClick = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        
        if (isGenerating && id === activeProjectId) {
            toast.warning('Cannot close tab while generating');
            return;
        }
        
        const canClose = closeProject(id);
        if (!canClose) {
            setCloseConfirmId(id);
        }
    };
    
    const handleNewTab = () => {
        createProject();
    };
    
    const getProjectDisplayName = (id: string): string => {
        const project = projects.get(id);
        if (!project) return 'Unknown';
        
        // Check if this is the active project and has unsaved changes
        const isDirty = id === activeProjectId 
            ? useHistoryStore.getState().isDirty 
            : project.isDirty;
        
        const prefix = isDirty ? '• ' : '';
        
        if (project.imagePath) {
            // Extract filename from path
            const fileName = project.imagePath.split(/[/\\]/).pop() || 'Untitled';
            // For project files, show name without extension
            if (fileName.endsWith('.banslice')) {
                return prefix + fileName.replace('.banslice', '');
            }
            return prefix + fileName;
        }
        
        return prefix + project.name;
    };
    
    return (
        <>
            <div className="tab-bar">
                <div className="tab-list">
                    {tabOrder.map(id => {
                        const isActive = id === activeProjectId;
                        return (
                            <div
                                key={id}
                                className={`tab ${isActive ? 'active' : ''}`}
                                onClick={() => handleTabClick(id)}
                            >
                                <span className="tab-name">{getProjectDisplayName(id)}</span>
                                <button 
                                    className="tab-close"
                                    onClick={(e) => handleCloseClick(e, id)}
                                    aria-label="Close tab"
                                >
                                    ×
                                </button>
                            </div>
                        );
                    })}
                </div>
                <button className="tab-new" onClick={handleNewTab} aria-label="New tab">
                    +
                </button>
            </div>
            
            <ConfirmDialog
                isOpen={closeConfirmId !== null}
                title="Unsaved Changes"
                message="This project has unsaved changes. Are you sure you want to close it?"
                confirmText="Discard & Close"
                cancelText="Cancel"
                variant="danger"
                onConfirm={() => {
                    if (closeConfirmId) {
                        forceCloseProject(closeConfirmId);
                    }
                    setCloseConfirmId(null);
                }}
                onCancel={() => setCloseConfirmId(null)}
            />
        </>
    );
}
