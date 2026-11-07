import { config } from '../data/gameConfig';
import { useGameStore } from '../state/gameStore';

export type SoundKind =
  'swish' | 'rim' | 'dribble' | 'post' | 'contest' | 'flop' | 'whistle' | 'bump';

const FREQUENCIES: Record<SoundKind, number> = {
  swish: 720,
  rim: 270,
  dribble: 150,
  post: 115,
  contest: 340,
  flop: 65,
  whistle: 1900,
  bump: 90,
};

let audio: AudioContext | null = null;

/** Called from a user gesture so browsers can unlock audio playback. */
export function enableAudio(): void {
  if (!useGameStore.getState().sound || typeof AudioContext === 'undefined') return;
  audio ??= new AudioContext();
  if (audio.state === 'suspended') void audio.resume().catch(() => {});
}

export function playSound(kind: SoundKind): void {
  if (!audio || audio.state !== 'running' || !useGameStore.getState().sound) return;

  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const time = audio.currentTime;
  const frequency = FREQUENCIES[kind];

  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.type = kind === 'swish' ? 'triangle' : 'sine';
  oscillator.frequency.setValueAtTime(frequency, time);
  oscillator.frequency.exponentialRampToValueAtTime(
    frequency * (kind === 'whistle' ? 0.9 : 0.35),
    time + 0.16,
  );
  gain.gain.setValueAtTime(config.effects.soundVolume, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
  oscillator.start(time);
  oscillator.stop(time + 0.23);
}

export function closeAudio(): void {
  const current = audio;
  audio = null;
  if (current && current.state !== 'closed') void current.close().catch(() => {});
}
