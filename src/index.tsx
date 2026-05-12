
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { DialogProvider } from './contexts/DialogContext';
import { ThemeProvider } from './contexts/ThemeContext';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
console.log('EzPrintWork index.tsx loaded');
root.render(
  <React.StrictMode>
    <ThemeProvider>
      <DialogProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </DialogProvider>
    </ThemeProvider>
  </React.StrictMode>
);