import { useEffect } from 'react';
import { GameCanvas } from './game/GameCanvas';
import { useGameStore } from './game/state/gameStore';
import { GAME_INPUT_EVENT,type GameInputEvent } from './components/touch-overlay/types';
import { HUD,PauseMenu,GameOver,WinScreen } from './components/game-ui';
import { TouchOverlay } from './components/touch-overlay';
import { enableAudio,closeAudio } from './game/entities/Duel';
export default function App(){
 const screen=useGameStore(s=>s.screen),score=useGameStore(s=>s.score),finalScore=useGameStore(s=>s.finalScore);
 useEffect(()=>{const handler=(e:Event)=>{const {action,phase}=(e as CustomEvent<GameInputEvent>).detail;if(action==='PAUSE'&&phase==='down'){const state=useGameStore.getState();if(state.screen==='playing')state.pause();else if(state.screen==='paused')state.resume();}};window.addEventListener(GAME_INPUT_EVENT,handler);return()=>{window.removeEventListener(GAME_INPUT_EVENT,handler);closeAudio();};},[]);
 return <div className="app-container" onPointerDown={enableAudio}><div className="game-viewport"><GameCanvas/>{screen==='playing'&&<><HUD score={score}/><TouchOverlay forceShow analogOnly buttonALabel="□" buttonBLabel="△"/></>}{screen==='paused'&&<PauseMenu/>}{screen==='win'&&<WinScreen score={finalScore}/ >}{screen==='gameover'&&<GameOver score={finalScore}/ >}</div></div>;
}
