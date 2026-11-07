import { create } from 'zustand';
import { config, type Legend } from '../data/gameConfig';
import { useInputStore } from './inputStore';
export type GameScreen = 'playing' | 'paused' | 'gameover' | 'win';
interface GameStore {
 screen:GameScreen; score:number; cpuScore:number; health:number; maxHealth:number; lives:number; level:number; finalScore:number;
 legends:[Legend,Legend]; energies:[number,number]; modes:[string,string]; owner:number; ballState:string; charge:number; message:string; messageId:number; revision:number; cpu:boolean; sound:boolean;
 setScreen:(s:GameScreen)=>void; pause:()=>void; resume:()=>void; reset:()=>void;
 choose:(slot:number,legend:Legend)=>void; toggleSound:()=>void;
}
export const useGameStore=create<GameStore>((set,get)=>({
 screen:'playing',score:0,cpuScore:0,health:100,maxHealth:100,lives:1,level:1,finalScore:0,
 legends:['shaq','chuck'],energies:[config.player.energyMax,config.player.energyMax],modes:['idle','idle'],owner:0,ballState:'held',charge:0,message:'Big suits. Bigger problems.',messageId:0,revision:0,cpu:true,sound:true,
 setScreen:screen=>{useInputStore.getState().flush();set({screen});},
 pause:()=>{useInputStore.getState().flush();set({screen:'paused'});},
 resume:()=>{useInputStore.getState().flush();set({screen:'playing'});},
 reset:()=>{useInputStore.getState().flush();set({screen:'playing',score:0,cpuScore:0,finalScore:0,revision:get().revision+1});},
 choose:(slot,legend)=>{if(get().legends[slot]===legend)return;const legends:[Legend,Legend]=[...get().legends];legends[slot]=legend;set({legends,revision:get().revision+1});},
 toggleSound:()=>set({sound:!get().sound})
}));
