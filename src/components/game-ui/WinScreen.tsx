import { MatchResult } from './MatchResult';

export function WinScreen({ score }: { score: number }) {
  return <MatchResult score={score} outcome="win" />;
}
