/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_UI_MOCK_SIDEBAR?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
