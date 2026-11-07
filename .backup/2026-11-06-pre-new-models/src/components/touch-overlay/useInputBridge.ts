import { useEffect } from 'react';
import { useInputStore } from '../../game/state/inputStore';
import { GAME_INPUT_EVENT, type GameInputEvent } from './types';
import { enableAudio } from '../../game/entities/Duel';
export function useInputBridge(){
 useEffect(()=>{
 const digital={MOVE_LEFT:false,MOVE_RIGHT:false,MOVE_UP:false,MOVE_DOWN:false};
 const handler=(e:Event)=>{
 const {action,phase,axis}=(e as CustomEvent<GameInputEvent>).detail;
 if(phase==='down')enableAudio();
 const s=useInputStore.getState();
 if(action==='MOVE'&&axis)s.setAxis(axis.x,-axis.y);
 if(action in digital){digital[action as keyof typeof digital]=phase==='down';s.setAxis(Number(digital.MOVE_RIGHT)-Number(digital.MOVE_LEFT),Number(digital.MOVE_UP)-Number(digital.MOVE_DOWN));}
 if(action==='ACTION_A')s.setAction('actionA',phase==='down');
 if(action==='ACTION_B')s.setAction('actionB',phase==='down');
 };
 const blur=()=>{Object.keys(digital).forEach(k=>digital[k as keyof typeof digital]=false);useInputStore.getState().flush();};
 window.addEventListener(GAME_INPUT_EVENT,handler);window.addEventListener('blur',blur);
 return()=>{window.removeEventListener(GAME_INPUT_EVENT,handler);window.removeEventListener('blur',blur);blur();};
 },[]);
}
