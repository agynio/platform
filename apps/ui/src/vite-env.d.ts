/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OBS_SERVER_URL?: string; // default http://localhost:4319
  readonly VITE_OBS_UI_BASE?: string; // default http://localhost:4320
  readonly VITE_GRAPH_API_BASE?: string; // optional override for graph API
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
