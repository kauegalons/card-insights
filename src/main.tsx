import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/app';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element in index.html');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
