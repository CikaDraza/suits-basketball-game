import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Group } from 'three';
import { level } from '../data/gameConfig';
import { duel } from './Duel';

/**
 * Sideline throw-in marker: a ring on the floor under the parked ball and a countdown
 * directly underneath the ball. POSITIONING counts 5 → 0, then PASS_WINDOW counts 5 → 0.
 * Updated imperatively every frame (no React re-render).
 */
export function InboundCountdown() {
  const group = useRef<Group>(null);
  const box = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const num = useRef<HTMLElement>(null);
  const last = useRef('');
  const visible = useRef(false);

  useFrame(() => {
    const on = duel.ballState === 'inbound';
    if (!box.current || !label.current || !num.current) return;
    if (on !== visible.current) {
      visible.current = on;
      if (group.current) group.current.visible = on;
      box.current.style.display = on ? 'flex' : 'none';
    }
    if (!on) {
      last.current = '';
      return;
    }
    const pass = duel.inboundStage === 'pass';
    const n = String(Math.max(0, Math.ceil(duel.inboundClock)));
    const who = duel.inboundOwner === 0 ? 'YOU' : 'CPU';
    const key = `${pass}|${n}|${who}`;
    if (key === last.current) return;
    last.current = key;
    box.current.className = 'inbound-countdown ' + (pass ? 'is-pass' : 'is-position');
    label.current.textContent = pass ? `${who} · PASS IN` : 'POSITION';
    num.current.textContent = n;
  });

  const { x, z } = level.inbound;
  return (
    <>
      <group ref={group} position={[x, 0.012, z]} visible={false}>
        <mesh rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.42, 0.5, 40]} />
          <meshBasicMaterial color="#ee5948" transparent opacity={0.85} depthWrite={false} />
        </mesh>
      </group>
      {/* directly underneath the parked ball (ball centre at y = level.inbound.y) */}
      <Html position={[x, 0.42, z]} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
        <div ref={box} className="inbound-countdown is-position" style={{ display: 'none' }}>
          <span ref={label}>POSITION</span>
          <b ref={num}>5</b>
        </div>
      </Html>
    </>
  );
}
