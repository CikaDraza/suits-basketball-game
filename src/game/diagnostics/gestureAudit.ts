import type { HandGesture } from '../input/skillGesture';
export interface GestureAudit {
  stage: 'requested' | 'queued' | 'accepted' | 'rejected' | 'cancelled';
  gesture: HandGesture;
  action?: string;
  reason?: string;
}
export type GestureObserver = (event: GestureAudit) => void;
