/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_UI_NEW_THREADS?: string;
  readonly VITE_UI_NEW_RUNS?: string;
  readonly VITE_UI_NEW_REMINDERS?: string;
  readonly VITE_UI_NEW_CONTAINERS?: string;
  readonly VITE_UI_NEW_SECRETS?: string;
  readonly VITE_UI_NEW_VARIABLES?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
