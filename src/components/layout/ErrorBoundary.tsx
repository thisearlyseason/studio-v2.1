'use client';

import React, { Component, ErrorInfo, ReactNode, useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  redirectTo: string | null;
}

function nextRedirectPath(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('digest' in error)) return null;
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== 'string') return null;

  const parts = digest.split(';');
  const destination = parts.slice(2, -2).join(';');
  const status = Number(parts.at(-2));
  const isRedirect = parts[0] === 'NEXT_REDIRECT' &&
    (parts[1] === 'replace' || parts[1] === 'push') &&
    Number.isFinite(status);

  return isRedirect && destination.startsWith('/') && !destination.startsWith('//')
    ? destination
    : null;
}

function RedirectFallback({ destination }: { destination: string }) {
  useEffect(() => {
    window.location.replace(destination);
  }, [destination]);
  return null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, redirectTo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    const redirectTo = nextRedirectPath(error);
    return redirectTo
      ? { hasError: false, error: null, redirectTo }
      : { hasError: true, error, redirectTo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (nextRedirectPath(error)) return;
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.redirectTo) {
      return <RedirectFallback destination={this.state.redirectTo} />;
    }

    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="max-w-md w-full mx-auto p-8 text-center space-y-6">
            <div className="bg-destructive/10 rounded-full w-20 h-20 flex items-center justify-center mx-auto">
              <span className="text-4xl">⚠️</span>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black uppercase tracking-tight">Something went wrong</h2>
              <p className="text-sm text-muted-foreground font-medium">
                An unexpected error occurred. Your data is safe — try refreshing the page.
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <Button
                onClick={() => window.location.reload()}
                className="rounded-full font-black uppercase text-xs px-6"
              >
                Refresh Page
              </Button>
              <Button
                variant="outline"
                onClick={() => { this.setState({ hasError: false, error: null, redirectTo: null }); }}
                className="rounded-full font-black uppercase text-xs px-6"
              >
                Try Again
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
