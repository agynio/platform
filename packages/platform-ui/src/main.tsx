import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initConfigViewsRegistry } from './configViews.init';
import { TooltipProvider } from '@agyn/ui';
import { BrowserRouter } from 'react-router-dom';
import { UserProvider } from './user/UserProvider';

const params = new URLSearchParams(window.location.search);
const debugParam = params.get('debug');
const shouldEnableDebug = debugParam === '1' || debugParam === 'true';

if (shouldEnableDebug) {
  const globalWindow = window as typeof window & {
    __AGYN_DEBUG_CONVERSATIONS__?: boolean;
    AGYN_DEBUG_CONVERSATIONS?: boolean;
  };
  globalWindow.__AGYN_DEBUG_CONVERSATIONS__ = true;
  globalWindow.AGYN_DEBUG_CONVERSATIONS = true;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {initConfigViewsRegistry()}
    <TooltipProvider>
      <BrowserRouter>
        <UserProvider>
          <App />
        </UserProvider>
      </BrowserRouter>
    </TooltipProvider>
  </StrictMode>,
)
