import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PreviewApp from './PreviewApp';

// A separate HTML entry, deliberately absent from Vite's production build inputs.
if (import.meta.env.DEV)
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <PreviewApp />
    </StrictMode>,
  );
