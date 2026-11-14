/// <reference types="vite/client" />

interface Window {
  /** Developer screenshot freeze; production pause is owned by gameStore. */
  __PAUSED__?: boolean;
}

declare const __SUITS_DIAGNOSTIC_BUILD__: {
  version: string;
  commit: string;
  codeSha256AtServerStart: string;
  dirtyAtServerStart: boolean;
  createdAt: string;
  engines: Record<string, string>;
  sha256: Record<string, string>;
};
