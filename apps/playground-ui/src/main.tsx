import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { USE_MOCKS } from './config';
import { syncThemeChrome } from './theme';
import '@fontsource-variable/mona-sans';
import '@fontsource-variable/work-sans';
import './index.css';

async function boot() {
  syncThemeChrome();
  if (USE_MOCKS) {
    const { startMocks } = await import('./mocks/browser');
    await startMocks();
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
