// Call once per independently cloned character; update the returned function in useFrame.
export function createFaceController(root) {
  const targets = [];
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = false;
    if (object.morphTargetDictionary && object.morphTargetInfluences) {
      targets.push(object);
    }
  });
  const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));
  return ({ blinkLeft = 0, blinkRight = blinkLeft, jawOpen = 0, gazeX = 0, gazeY = 0 } = {}) => {
    const leftBlink = clamp01(blinkLeft);
    const rightBlink = clamp01(blinkRight);
    const x = Math.min(1, Math.max(-1, Number(gazeX) || 0));
    const y = Math.min(1, Math.max(-1, Number(gazeY) || 0));
    for (const object of targets) {
      const visible = object.name.includes('EyeLeft') ? 1 - leftBlink
        : object.name.includes('EyeRight') ? 1 - rightBlink : 1;
      const values = {
        eyeBlinkLeft: leftBlink,
        eyeBlinkRight: rightBlink,
        jawOpen: clamp01(jawOpen),
        eyeLookLeft: Math.max(-x, 0) * visible,
        eyeLookRight: Math.max(x, 0) * visible,
        eyeLookUp: Math.max(y, 0) * visible,
        eyeLookDown: Math.max(-y, 0) * visible,
      };
      for (const [name, value] of Object.entries(values)) {
        const index = object.morphTargetDictionary[name];
        if (index !== undefined) object.morphTargetInfluences[index] = value;
      }
    }
  };
}
