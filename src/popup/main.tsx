import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@ui/styles.css';
import { applyTheme, watchTheme } from '@ui/theme';
import { Popup } from './Popup';

applyTheme();
watchTheme();

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
