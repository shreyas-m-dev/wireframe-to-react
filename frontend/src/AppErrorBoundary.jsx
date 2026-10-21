import React from 'react';

/**
 * Top-level safety net: an uncaught render error shows a recoverable screen
 * instead of a blank page. The error message itself is not shown (it can
 * contain internals); it still goes to the console for debugging.
 */
export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('Uncaught error in app:', error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="min-h-dvh grid place-items-center p-6">
        <div role="alert" className="tile max-w-md w-full p-6 text-center">
          <p className="text-title text-danger mb-2">Something went wrong.</p>
          <p className="text-text-muted mb-4">The page hit an unexpected error. Your projects and runs are saved; reloading usually fixes this.</p>
          <button type="button" onClick={() => window.location.reload()} className="h-10 px-4 rounded-md bg-accent-bg text-accent-on font-medium">Reload page</button>
        </div>
      </main>
    );
  }
}
