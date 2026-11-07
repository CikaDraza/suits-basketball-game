/** One foot stays on the floor while the other returns; phase follows distance, not input. */
export function sampleFootstep(phase: number, stride: number, lift: number) {
  const cycle = ((phase % 1) + 1) % 1;
  return {
    travel: cycle < 0.5 ? stride * (0.5 - cycle * 2) : stride * (cycle * 2 - 1.5),
    lift: cycle < 0.5 ? 0 : Math.sin((cycle - 0.5) * Math.PI * 2) * lift,
    planted: cycle < 0.5,
  };
}

/** Resolve the contact arm in character space, retaining its side near the centerline. */
export function contactArm(localX: number, previous: -1 | 1, deadzone: number): -1 | 1 {
  return Math.abs(localX) < deadzone ? previous : localX > 0 ? 1 : -1;
}
