import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled runtime error in Aifinity:', error, errorInfo);
  }

  private handleReload = () => {
    try {
      window.location.reload();
    } catch {
      window.location.href = '/';
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-black text-gray-200 flex flex-col items-center justify-center p-6 font-mono select-none z-50">
          <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-lg p-6 shadow-2xl text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-lg">
              !
            </div>
            <h1 className="text-lg font-bold text-white mb-2 tracking-wide">
              APPLICATION RECOVERY
            </h1>
            <p className="text-xs text-neutral-400 mb-4 leading-relaxed">
              A temporary initialization or browser rendering issue occurred.
            </p>
            {this.state.error?.message && (
              <div className="mb-5 p-2.5 bg-neutral-950 border border-neutral-800 rounded text-[11px] text-amber-300 font-mono text-left break-words overflow-auto max-h-24">
                {this.state.error.message}
              </div>
            )}
            <button
              onClick={this.handleReload}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white rounded font-semibold text-xs tracking-wider uppercase transition-colors"
            >
              Reload Aifinity
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
