/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'true' serves the API from MSW and simulates run events. Defaults to true in dev. */
  readonly VITE_USE_MOCKS?: string;
  /** BFF origin; empty means same origin. */
  readonly VITE_BFF_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
