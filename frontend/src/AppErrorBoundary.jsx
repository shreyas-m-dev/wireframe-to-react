import React from 'react';

/**
 * Top-level safety net. React's own dev-console warning explicitly asks
 * for one of these ("Consider adding an error boundary to your tree") —
 * without it, any uncaught error anywhere in the component tree unmounts
 * everything and leaves a blank page with no on-screen indication that
 * anything went wrong (the only trace is in the browser console, which
 * most people won't think to open). This was hit for real: a bug in the
 * pipeline-status animation (see App.jsx) crashed the whole app on any
 * request slower than ~2.7 seconds. That specific bug is fixed, but this
 * boundary stays as a backstop for whatever the next one turns out to be.
 */
export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // still goes to the console for debugging — this just ALSO shows
    // something on screen, rather than replacing the console trace
    console.error('Uncaught error in app:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-bg text-text font-sans flex items-center justify-center p-6">
          <div className="max-w-md w-full border border-danger/40 bg-danger/10 rounded-xl p-6 text-center">
            <p className="text-danger font-semibold mb-2">Something went wrong.</p>
            <p className="text-text-dim text-sm mb-4">
              {this.state.error.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm font-semibold px-5 py-2 rounded-lg bg-accent text-white hover:bg-accent-dim transition-colors"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
