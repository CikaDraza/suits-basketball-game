// FIBA dimensions in meters. Coordinate system:
//   x — along the court, baseline at 0 → half-court line at 14
//   z — across the court, sidelines at ±7.5
//   y — up
export const COURT = {
  LENGTH: 14, // half-court depth (baseline → center line)
  HALF_WIDTH: 7.5,
  LINE: 0.05,
  KEY_HALF_WIDTH: 2.45,
  KEY_DEPTH: 5.8,
  FT_RADIUS: 1.8,
  BASKET_X: 1.575,
  THREE_RADIUS: 6.75,
  THREE_CORNER_Z: 6.6,
  RESTRICTED_RADIUS: 1.25,
  BOARD_X: 1.2, // backboard front face
  RIM_Y: 3.05,
  RIM_RADIUS: 0.234, // ring centerline (0.45 m inner diameter)
  RIM_TUBE: 0.009,
  FLOOR_SIZE: 60,
  FLOOR_CENTER_X: 7,
} as const;

/** Outer edge offset of a boundary line from its centerline. */
export const LINE_EDGE = COURT.LINE / 2;

export const HOOP = {
  BASE_X: -1.1,
  BASE_TOP: 1.72,
  LOWER_ARM_LEN: 1.1,
  LOWER_ARM_TILT: -0.35, // rad, rest lean toward the court
  MOUNT: [1.1, 3.3] as const, // backboard mount point (x, y) in world
  BOARD_W: 1.8,
  BOARD_H: 1.05,
  BOARD_BOTTOM: 2.9,
} as const;

export const BALL = { RADIUS: 0.12, MASS: 0.62 } as const;

export const CAMERA = {
  position: [24.5, 12.34, 7.48] as [number, number, number],
  target: [9.5, 0, -0.5] as [number, number, number],
  fov: 40,
  refAspect: 1.6, // below this aspect the FOV widens so the full half-court stays in frame
};

export const COLORS = {
  line: '#f3f1ec',
  pad: '#b0150e',
  steel: '#c9ccd0',
  glass: '#c4dce4',
  rim: '#d9431c',
  net: '#f2f2ee',
} as const;
