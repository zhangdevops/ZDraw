import type { DesktopApi } from '../../shared/types';

declare global {
  interface Window {
    zdraw: DesktopApi;
    EXCALIDRAW_ASSET_PATH: string;
  }
}

export {};
