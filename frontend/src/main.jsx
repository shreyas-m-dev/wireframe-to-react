import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './index.css';
import App from './App.jsx';
import AppErrorBoundary from './AppErrorBoundary.jsx';
import { applyInitialTheme } from './lib/theme';

applyInitialTheme();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
