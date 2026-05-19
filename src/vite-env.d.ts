interface ImportMetaEnv {
  readonly GOOGLE_MAPS_PLATFORM_KEY?: string;
  readonly VITE_GOOGLE_MAPS_PLATFORM_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
