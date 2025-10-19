/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OBS_SERVER_URL?: string; // default http://localhost:4319
  readonly VITE_OBS_UI_BASE?: string; // default http://localhost:4320
  readonly VITE_API_BASE_URL?: string; // optional override for API base
  // no specific var for reminders; uses API base
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
