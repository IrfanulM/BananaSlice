// Progress Indicator Component
// Provides visual feedback for loading states throughout the app

import './ProgressIndicator.css';

export type ProgressStage = {
    id: string;
    label: string;
    status: 'pending' | 'active' | 'complete';
};

interface ProgressIndicatorProps {
    /** Whether to show the progress indicator */
    visible: boolean;
    /** Primary message to display */
    message?: string;
    /** Secondary message for additional context */
    subMessage?: string;
    /** Progress percentage (0-100), undefined for indeterminate */
    progress?: number;
    /** Optional stages to show current progress through a multi-step process */
    stages?: ProgressStage[];
    /** Visual variant */
    variant?: 'overlay' | 'inline' | 'panel';
}

export function ProgressIndicator({
    visible,
    message = 'Loading...',
    subMessage,
    progress,
    stages,
    variant = 'overlay',
}: ProgressIndicatorProps) {
    if (!visible) return null;

    const isIndeterminate = progress === undefined;

    if (variant === 'inline') {
        return (
            <span className="inline-spinner">
                <span className="progress-spinner small" />
                {message}
            </span>
        );
    }

    const content = (
        <>
            <div className="progress-spinner" />
            <div className="progress-text">{message}</div>

            {/* Progress bar */}
            {(progress !== undefined || isIndeterminate) && (
                <div className="progress-bar-container">
                    <div
                        className={`progress-bar-fill ${isIndeterminate ? 'indeterminate' : ''}`}
                        style={!isIndeterminate ? { width: `${progress}%` } : undefined}
                    />
                </div>
            )}

            {subMessage && <div className="progress-subtext">{subMessage}</div>}

            {/* Progress stages */}
            {stages && stages.length > 0 && (
                <div className="progress-stages">
                    {stages.map((stage) => (
                        <div key={stage.id} className={`progress-stage ${stage.status}`}>
                            <span className="progress-stage-icon">
                                {stage.status === 'complete' && '✓'}
                                {stage.status === 'active' && (
                                    <span className="progress-spinner" />
                                )}
                                {stage.status === 'pending' && '○'}
                            </span>
                            <span>{stage.label}</span>
                        </div>
                    ))}
                </div>
            )}
        </>
    );

    if (variant === 'panel') {
        return <div className="panel-loading-overlay">{content}</div>;
    }

    return <div className="progress-overlay">{content}</div>;
}

// Simplified spinner for buttons and inline use
export function Spinner({ size = 'small' }: { size?: 'small' | 'medium' | 'large' }) {
    return <span className={`progress-spinner ${size}`} />;
}

// Hook for managing progress stages
export function useProgressStages(stageLabels: string[]) {
    const createStages = (activeIndex: number): ProgressStage[] => {
        return stageLabels.map((label, index) => ({
            id: `stage-${index}`,
            label,
            status: index < activeIndex ? 'complete' : index === activeIndex ? 'active' : 'pending',
        }));
    };

    return { createStages };
}
