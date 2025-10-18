import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initConfigViewsRegistry } from './configViews.init';
import { TooltipProvider } from '@hautech/ui';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {initConfigViewsRegistry()}
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>,
)
