import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@ui/styles.css';
import { applyTheme } from '@ui/theme';
import { Options } from './Options';

applyTheme();

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <Options />
  </StrictMode>,
);
