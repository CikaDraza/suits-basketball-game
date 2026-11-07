/// <reference types="vite/client" />

interface Window {
  /** Developer screenshot freeze; production pause is owned by gameStore. */
  __PAUSED__?: boolean;
}
