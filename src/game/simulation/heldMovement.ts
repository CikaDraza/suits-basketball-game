export interface HeldMovement {
  dirHeld: number;
  pendingMoveX: number;
  pendingMoveZ: number;
}

export interface ReleasedMovement {
  x: number;
  z: number;
  duration: number;
}
const NO_RELEASES: readonly ReleasedMovement[] = [];

/** Input-event timing preserves taps even when press and release fall between physics frames. */
export function createMovementTracker(minMove: number) {
  let active = false,
    started = 0,
    x = 0,
    z = 0;
  let released: ReleasedMovement[] = [];
  return {
    update(nextX: number, nextZ: number, now: number) {
      const moving = Math.hypot(nextX, nextZ) > minMove;
      if (moving && !active) started = now;
      if (active && !moving) {
        released.push({ x, z, duration: Math.max(0, now - started) });
        if (released.length > 16) released.shift();
      }
      active = moving;
      x = nextX;
      z = nextZ;
    },
    duration(now: number) {
      return active ? Math.max(0, now - started) : 0;
    },
    takeReleases() {
      if (released.length === 0) return NO_RELEASES;
      const result = released;
      released = [];
      return result;
    },
    cancel() {
      active = false;
      released = [];
    },
  };
}

export function stepTimedHeldMovement(
  state: HeldMovement,
  x: number,
  z: number,
  heldFor: number,
  releases: readonly ReleasedMovement[],
  minMove: number,
  tapWindow: number,
) {
  for (const release of releases) {
    const commit = stepHeldMovement(
      state,
      release.x,
      release.z,
      Math.max(0, release.duration - state.dirHeld),
      minMove,
      tapWindow,
    );
    const tap = stepHeldMovement(state, 0, 0, 0, minMove, tapWindow);
    if (commit || tap) return commit ?? tap;
  }
  return stepHeldMovement(state, x, z, Math.max(0, heldFor - state.dirHeld), minMove, tapWindow);
}

export function cancelHeldMovement(state: HeldMovement): void {
  state.dirHeld = 0;
  state.pendingMoveX = 0;
  state.pendingMoveZ = 0;
}

/** A tap is known only on release. A continuing press commits without playing a jab first. */
export function stepHeldMovement(
  state: HeldMovement,
  x: number,
  z: number,
  dt: number,
  minMove: number,
  tapWindow: number,
): 'jab' | 'dribble' | null {
  if (Math.hypot(x, z) > minMove) {
    state.pendingMoveX = x;
    state.pendingMoveZ = z;
    state.dirHeld += dt;
    if (state.dirHeld + 1e-9 >= tapWindow) {
      cancelHeldMovement(state);
      return 'dribble';
    }
    return null;
  }
  const tapped = state.dirHeld > 0 && state.dirHeld < tapWindow;
  state.dirHeld = 0;
  return tapped ? 'jab' : null;
}
