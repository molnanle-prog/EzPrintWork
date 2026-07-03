import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { DialogProvider } from './contexts/DialogContext';
import { ThemeProvider } from './contexts/ThemeContext';
import './index.css';
import { db } from './services/dataService';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
console.log('EzPrintWork index.tsx loaded');

const renderFatalError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  rootElement.innerHTML = `
    <div style="font-family:sans-serif;padding:24px;max-width:640px;margin:40px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;">
      <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a;">EzPrintWork 시작 오류</h1>
      <p style="margin:0 0 8px;color:#475569;">앱을 불러오지 못했습니다. Ctrl+Shift+R 로 새로고침해 주세요.</p>
      <pre style="white-space:pre-wrap;background:#f8fafc;padding:12px;border-radius:8px;color:#b91c1c;font-size:12px;">${message}</pre>
    </div>
  `;
};

db.init()
  .finally(() => {
    try {
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
    } catch (error) {
      renderFatalError(error);
    }
  })
  .catch(renderFatalError);
