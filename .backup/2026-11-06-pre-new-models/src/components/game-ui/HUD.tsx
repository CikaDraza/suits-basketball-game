import { useGameStore } from '../../game/state/gameStore';
import { useInputStore } from '../../game/state/inputStore';
import { config } from '../../game/data/gameConfig';
export function HUD({score}:{score:number;lives?:number;level?:number}){
 const s=useGameStore();const perfect=Math.abs(s.charge-config.shots.perfectTime)<=config.shots.perfectWindow;
 const action=s.modes[0]==='down'?'MASH TO GET UP':s.ballState==='inbound'?'Q · INBOUND':s.owner===0?'HOLD / RELEASE':'HOLD TO CONTEST';
 return <div className="hud">
 <header className="hud-header"><div className="fighter-chip"><img src={`images/${s.legends[0]}-portrait.png`} alt=""/><div><span className="micro">YOU · {config.player[s.legends[0]].name}</span><strong>{score.toString().padStart(2,'0')}</strong><div className={'energy '+(s.energies[0]<config.player.exhaustedThreshold?'low':'')}><i style={{width:`${s.energies[0]}%`}}/></div></div></div><div className="match-chip"><span className="micro">NO FOULS</span><b>FIRST TO {config.score.winTarget}</b><span className="live-dot">● LIVE</span></div><div className="fighter-chip rival"><div><span className="micro">{s.cpu?'CPU':'P2'} · {config.player[s.legends[1]].name}</span><strong>{s.cpuScore.toString().padStart(2,'0')}</strong><div className="energy blue"><i style={{width:`${s.energies[1]}%`}}/></div></div><img src={`images/${s.legends[1]}-portrait.png`} alt=""/></div></header>
 <div className="court-heading"><span>THE LAST DANCE</span><h1>SUITS<span>.</span></h1><p>ALL BUSINESS. NO FOULS.</p></div><button className="pause-btn" onClick={s.pause} aria-label="Pause">Ⅱ</button>
 {s.message&&<div key={s.message} className="trash-talk">{s.message}</div>}
 <div className="bottom-info"><span className="micro">{s.modes[0]==='idle'?(s.owner===0?'ON OFFENSE':'ON DEFENSE'):s.modes[0].toUpperCase()}</span><div className={'shot-meter '+(perfect?'perfect':'')}><div className="target" style={{left:`${(config.shots.perfectTime-config.shots.perfectWindow)/config.shots.raiseDuration*100}%`,width:`${config.shots.perfectWindow*2/config.shots.raiseDuration*100}%`}}/><i style={{left:`${Math.min(98,s.charge/config.shots.raiseDuration*100)}%`}}/></div><p>{perfect?'RELEASE!':action}</p></div>
 {s.ballState==='inbound'&&<button className="inbound-prompt" aria-label="Pass inbound" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);useInputStore.getState().setAction('actionB',true);window.setTimeout(()=>useInputStore.getState().setAction('actionB',false),config.player.modeCooldown*1000);}} onPointerUp={()=>useInputStore.getState().setAction('actionB',false)} onPointerCancel={()=>useInputStore.getState().setAction('actionB',false)}>◯<span>Q / △</span></button>}
 <div className="control-legend"><span>MOVE</span><span>△ POST / SPIN</span><span>□ SHOOT / CONTEST</span></div>
 </div>;
}
