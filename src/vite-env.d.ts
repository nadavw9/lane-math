/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LANE_MATH_HARNESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
