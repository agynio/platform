// Explicit initialization of built-in ConfigViews (no side-effect registrations)
import { installDefaultConfigViews } from './components/configViews/registerDefaults';
import { registerConfigView } from './components/configViews/registry';

export function initConfigViewsRegistry(): null {
  // Register all defaults during app startup
  installDefaultConfigViews(registerConfigView);
  return null;
}
