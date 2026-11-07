import { MatchResult } from './MatchResult';

export function GameOver({ score }: { score: number }) {
  return <MatchResult score={score} outcome="loss" />;
}
