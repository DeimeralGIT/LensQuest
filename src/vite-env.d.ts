interface ImportMetaEnv {
  readonly GOOGLE_MAPS_PLATFORM_KEY?: string;
  readonly VITE_GOOGLE_MAPS_PLATFORM_KEY?: string;
  readonly VITE_ADSENSE_BANNER_SLOT?: string;
  readonly VITE_ADSENSE_GALLERY_SLOT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
