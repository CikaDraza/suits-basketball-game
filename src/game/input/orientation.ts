/** Fullscreen and orientation locking must be attempted from a user gesture. */
export async function lockLandscape(): Promise<void> {
  if (!window.matchMedia('(pointer: coarse)').matches) return;

  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>;
    };
    await orientation.lock?.('landscape');
  } catch {
    // The portrait guard still covers browsers that cannot lock their orientation.
  }
}
