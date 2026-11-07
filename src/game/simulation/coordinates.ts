/** Camera-relative input and world movement use the same orthogonal transform. */
export function createMovementTransform(angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    stickToWorld(x: number, z: number) {
      return { x: x * cos - z * sin, z: -x * sin - z * cos };
    },
    worldToStick(dx: number, dz: number, deadzone = 0) {
      const distance = Math.hypot(dx, dz);
      if (distance <= deadzone || distance === 0) return { x: 0, z: 0 };
      return {
        x: (dx * cos - dz * sin) / distance,
        z: -(dx * sin + dz * cos) / distance,
      };
    },
  };
}
