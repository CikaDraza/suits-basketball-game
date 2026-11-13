import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import DefensePreview from './DefensePreview';

if (import.meta.env.DEV)
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <DefensePreview />
    </StrictMode>,
  );
