'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RotateCcw, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('dashboard_wordBrowsingHistory');
        localStorage.removeItem('dashboard_wordBrowsingIndex');
        localStorage.removeItem('wordListState');
        sessionStorage.clear();
      }
    } catch {}
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[200px] w-full flex flex-col items-center justify-center p-6 bg-neutral-950/80 border border-red-900/40 rounded-2xl text-center space-y-4 my-4">
          <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center border border-red-500/20">
            <AlertTriangle size={24} />
          </div>
          <div className="space-y-1 max-w-md">
            <h3 className="text-sm font-bold text-white">
              {this.props.fallbackTitle || '组件加载遇到问题'}
            </h3>
            <p className="text-xs text-neutral-400">
              {this.state.error?.message || '发生了未预期的客户端异常'}
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-xs font-semibold text-white transition-all shadow-lg hover:scale-105"
          >
            <RotateCcw size={13} />
            <span>重置缓存并恢复页面</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
