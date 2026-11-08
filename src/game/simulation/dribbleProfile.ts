import { config, type Legend } from '../data/gameConfig';

/** One fixed-step profile is shared by the ball path and the hand presentation. */
export interface DribbleShape {
  hipSide: number;
  dribbleForward: number;
  dribbleTop: number;
  drop: number;
  retractSide: number;
  retractForward: number;
  poleSide: number;
  poleForward: number;
}
const mix = (a: number, b: number, weight: number) => a + (b - a) * weight;

export function createDribbleShape(legend: Legend): DribbleShape {
  const ball = config.ballControl[legend];
  const hand = config.animation.dribbleHand[legend];
  return {
    hipSide: ball.hipSide,
    dribbleForward: ball.dribbleForward,
    dribbleTop: ball.dribbleTop,
    drop: hand.drop,
    retractSide: hand.retractSide,
    retractForward: hand.retractForward,
    poleSide: 0.08,
    poleForward: -1.2,
  };
}

export function writeDribbleShape(
  out: DribbleShape,
  legend: Legend,
  postBlend: number,
  pressureSide: number,
  pressureForward: number,
) {
  const ball = config.ballControl[legend];
  const hand = config.animation.dribbleHand[legend];
  const post = config.ballControl.postDribble[legend];
  out.hipSide = mix(ball.hipSide, post.hipSide, postBlend) + pressureSide * postBlend;
  out.dribbleForward =
    mix(ball.dribbleForward, post.dribbleForward, postBlend) + pressureForward * postBlend;
  out.dribbleTop = mix(ball.dribbleTop, post.dribbleTop, postBlend);
  out.drop = mix(hand.drop, post.drop, postBlend);
  out.retractSide = mix(hand.retractSide, post.retractSide, postBlend);
  out.retractForward = mix(hand.retractForward, post.retractForward, postBlend);
  out.poleSide = mix(0.08, post.poleSide, postBlend);
  out.poleForward = mix(-1.2, post.poleForward, postBlend);
}
