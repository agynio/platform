import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initConfigViewsRegistry } from './configViews.init';
import { TooltipProvider } from '@agyn/ui-new';
import { BrowserRouter } from 'react-router-dom';
import { UserProvider } from './user/UserProvider';

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
