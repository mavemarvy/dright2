import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './contexts/ThemeContext';
import { CurrencyProvider } from './contexts/CurrencyContext';
import { LanguageProvider } from './contexts/LanguageContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <CurrencyProvider>
        <LanguageProvider>
          <App />
        </LanguageProvider>
      </CurrencyProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
