import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@ui/styles.css';
import { applyTheme } from '@ui/theme';
import { App } from './App';

applyTheme();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
