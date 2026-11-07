import {
  createDefaultProfile,
  CONTROL_ACTIONS,
  type ControlAction,
} from '../../game/input/controlBindings';
export type ActionId = ControlAction | 'MOVE';

export const GAME_INPUT_EVENT = 'game:input';

export type ActionPhase = 'down' | 'up' | 'change';

export interface GameInputEvent {
  action: ActionId;
  phase: ActionPhase;
  axis?: { x: number; y: number };
  value?: number;
  source?: 'keyboard' | 'touch';
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

export const DEFAULT_KEY_MAP: Readonly<Partial<Record<string, ActionId>>> = Object.fromEntries(
  CONTROL_ACTIONS.flatMap((action) =>
    createDefaultProfile().offense.keyboard[action].map((code) => [code, action]),
  ),
);
