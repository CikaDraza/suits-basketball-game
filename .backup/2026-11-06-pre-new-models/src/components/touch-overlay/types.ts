export type ActionId =
  | "MOVE"
  | "MOVE_LEFT"
  | "MOVE_RIGHT"
  | "MOVE_UP"
  | "MOVE_DOWN"
  | "ACTION_A"
  | "ACTION_B"
  | "PAUSE";

export const GAME_INPUT_EVENT = "game:input";

export type ActionPhase = "down" | "up" | "change";

export interface GameInputEvent {
  action: ActionId;
  phase: ActionPhase;
  axis?: { x: number; y: number };
  value?: number;
}

export interface TouchOverlayConfig {
  showJoystick?: boolean;
  showButtonA?: boolean;
  showButtonB?: boolean;
  buttonALabel?: string;
  buttonBLabel?: string;
  deadzone?: number;
  threshold?: number;
  analogOnly?: boolean;
  forceShow?: boolean;
}

export const DEFAULT_KEY_MAP: Record<string, ActionId> = {
  ArrowLeft: "MOVE_LEFT",
  KeyA: "MOVE_LEFT",
  ArrowRight: "MOVE_RIGHT",
  KeyD: "MOVE_RIGHT",
  ArrowUp: "MOVE_UP",
  KeyW: "MOVE_UP",
  ArrowDown: "MOVE_DOWN",
  KeyS: "MOVE_DOWN",
  Space: "ACTION_A",
  KeyR: "ACTION_A",
  KeyQ: "ACTION_B",
  KeyJ: "ACTION_B",
  Escape: "PAUSE",
};
