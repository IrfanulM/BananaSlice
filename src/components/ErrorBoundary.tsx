// Error Boundary Component
// Catches React errors and displays a fallback UI

import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Error caught by boundary:', error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="error-boundary">
                    <div className="error-boundary-content">
                        <div className="error-boundary-icon">⚠️</div>
                        <h2>Something went wrong</h2>
                        <p className="error-boundary-message">
                            {this.state.error?.message || 'An unexpected error occurred'}
                        </p>
                        <div className="error-boundary-actions">
                            <button
                                className="error-boundary-btn primary"
                                onClick={this.handleRetry}
                            >
                                Try Again
                            </button>
                            <button
                                className="error-boundary-btn secondary"
                                onClick={() => window.location.reload()}
                            >
                                Reload App
                            </button>
                        </div>
                        <details className="error-boundary-details">
                            <summary>Technical Details</summary>
                            <pre>{this.state.error?.stack}</pre>
                        </details>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
