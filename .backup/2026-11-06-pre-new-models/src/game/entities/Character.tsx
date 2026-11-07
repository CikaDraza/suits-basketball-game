import { useMemo,useEffect,useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry,Color,Float32BufferAttribute,SphereGeometry,BoxGeometry,CylinderGeometry,Group,Mesh,Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { config, type Legend } from '../data/gameConfig';import { duel } from './Duel';
type Part={g:BufferGeometry;p?:number[];s?:number[];r?:number[];color:string};
export function coloredMerge(parts:Part[]){const geometries=parts.map(part=>{let g=part.g.toNonIndexed();part.g.dispose();if(part.s)g.scale(part.s[0],part.s[1],part.s[2]);if(part.r){g.rotateX(part.r[0]);g.rotateY(part.r[1]);g.rotateZ(part.r[2]);}if(part.p)g.translate(part.p[0],part.p[1],part.p[2]);const color=new Color(part.color),colors=new Float32Array(g.getAttribute('position').count*3);for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}g.setAttribute('color',new Float32BufferAttribute(colors,3));g.deleteAttribute('uv');return g;});const merged=mergeGeometries(geometries,false)!;geometries.forEach(g=>g.dispose());return merged;}
const sphere=(p:number[],s:number[],color:string):Part=>({g:new SphereGeometry(1,12,8),p,s,color});
const box=(p:number[],s:number[],color:string,r?:number[]):Part=>({g:new BoxGeometry(1,1,1),p,s,color,r});
function build(legend:Legend){const stat=config.player[legend],h=stat.height,skin=stat.skin,suit=stat.suit,headY=h-0.48- config.physics.bodyY,torsoY=h*0.53-config.physics.bodyY;const dark=legend==='shaq'?'#0d1115':'#757e85';const features:Part[]=[
 {g:new CylinderGeometry(0.54,0.57,h*0.34,10),p:[0,torsoY,0],s:[stat.width,1,0.67],color:suit},
 sphere([0,torsoY-0.1,0.04],[0.61,0.5,0.37],suit),
 sphere([-0.49,torsoY+0.28,0],[0.23,0.24,0.29],suit),sphere([0.49,torsoY+0.28,0],[0.23,0.24,0.29],suit),
 {g:new CylinderGeometry(0.18,0.22,0.28,10),p:[0,headY-0.38,0],color:skin},
 sphere([0,headY,0.01],[legend==='shaq'?0.39:0.41,0.45,0.34],skin),sphere([-0.4,headY,0],[0.075,0.13,0.07],skin),sphere([0.4,headY,0],[0.075,0.13,0.07],skin),
 sphere([0,headY-0.18,0.12],[0.32,0.24,0.27],skin),
 box([0,torsoY+0.15,0.355],[0.3,0.63,0.03],'#0e141a'),
 box([-0.19,torsoY+0.27,0.37],[0.17,0.5,0.05],dark,[0,0,-0.32]),box([0.19,torsoY+0.27,0.37],[0.17,0.5,0.05],dark,[0,0,0.32]),
 box([0.32,torsoY+0.15,0.37],[0.2,0.04,0.035],dark),box([0.33,torsoY+0.18,0.37],[0.09,0.04,0.03],legend==='shaq'?'#b6bfc4':'#d7dbdc'),
 sphere([0.04,torsoY-0.18,0.411],[0.025,0.025,0.015],'#b0aaa0'),
 sphere([-0.145,headY+0.04,0.30],[0.075,0.043,0.04],'#eee2cb'),sphere([0.145,headY+0.04,0.30],[0.075,0.043,0.04],'#eee2cb'),
 sphere([-0.145,headY+0.04,0.337],[0.027,0.03,0.02],'#151518'),sphere([0.145,headY+0.04,0.337],[0.027,0.03,0.02],'#151518'),
 box([-0.14,headY+0.13,0.31],[0.15,0.04,0.04],'#38251e',[0,0,0.08]),box([0.14,headY+0.13,0.31],[0.15,0.04,0.04],'#38251e',[0,0,-0.08]),
 sphere([0,headY-0.04,0.335],[0.104,0.12,0.09],skin),
 sphere([-0.24,headY-0.11,0.24],[0.12,0.12,0.1],skin),sphere([0.24,headY-0.11,0.24],[0.12,0.12,0.1],skin),
 box([0,headY-0.22,0.343],[0.18,0.055,0.02],'#e7ddca',[0,0,0]),sphere([0,headY-0.275,0.29],[0.12,0.025,0.04],'#74442f')];
 if(legend==='shaq'){features.push(box([0,torsoY+0.24,0.4],[0.08,0.38,0.035],'#080b0e'),sphere([0,headY-0.3,0.16],[0.29,0.135,0.2],'#2a2625'),box([0,headY-0.17,0.33],[0.21,0.027,0.025],'#292524'));for(const x of [-0.15,0.15]){features.push(box([x,headY+0.10,0.356],[0.24,0.018,0.025],'#929a99'),box([x,headY-0.02,0.356],[0.24,0.018,0.025],'#929a99'));for(const edge of [-0.11,0.11])features.push(box([x+edge,headY+0.04,0.356],[0.015,0.13,0.025],'#929a99'));}features.push(box([0,headY+0.065,0.372],[0.07,0.016,0.015],'#929a99'));}
 const body=coloredMerge(features),arm=coloredMerge([{g:new CylinderGeometry(0.17,0.145,h*0.29,8),p:[0,-h*0.12,0],color:suit},box([0,-h*0.24,0.01],[0.25,0.055,0.23],legend==='shaq'?'#c0c6c5':'#14171a'),sphere([0,-h*0.29,0.015],[0.16,0.17,0.14],skin)]),leg=coloredMerge([{g:new CylinderGeometry(0.2,0.15,h*0.36,8),p:[0,-h*0.17,0],color:suit},box([0,-h*0.37,0.12],[0.34,0.16,0.56],'#151719')]);return{body,arm,leg,torsoY,h};}
export function Character({index,legend}:{index:number;legend:Legend}){const geo=useMemo(()=>build(legend),[legend]);const root=useRef<Group>(null),left=useRef<Mesh>(null),right=useRef<Mesh>(null),ll=useRef<Mesh>(null),rl=useRef<Mesh>(null);const smooth=useRef(0);
 useEffect(()=>()=>{geo.body.dispose();geo.arm.dispose();geo.leg.dispose();},[geo]);
 useFrame((_,dt)=>{const p=duel.players[index];if(!root.current)return;const down=p.mode==='down';smooth.current+=(Number(down)-smooth.current)*(1-Math.exp(-12*dt));root.current.rotation.x=smooth.current*Math.PI/2;root.current.position.y=-smooth.current*0.65+(p.mode==='dunk'?Math.sin(p.timer*5)*0.15:0);root.current.rotation.y=p.angle;const breath=p.energy<config.player.exhaustedThreshold?Math.sin(duel.time*7)*0.05:Math.sin(duel.time*3)*0.012;root.current.rotation.z=p.mode==='stun'?Math.sin(duel.time*22)*0.13:breath;root.current.scale.set(1,1+Math.abs(breath)*0.22,1);const walk=Math.sin(duel.time*7)*0.25*p.moving,raise=p.charge>0?-Math.min(1,p.charge/config.shots.perfectTime)*2.9:p.mode==='dunk'?-2.9:p.mode==='shoot'?-2.8:p.mode==='post'?-0.3:walk;const hook=Math.hypot(p.x-duel.flight.tx,p.z-duel.flight.tz)<config.shots.hookRange; if(left.current){left.current.rotation.x=p.mode==='contest'?(p.hand<0?-Math.PI:-1.9):hook&&p.mode==='shoot'?-0.3:raise;left.current.rotation.z=0.12;}if(right.current){right.current.rotation.x=p.mode==='contest'?(p.hand>0?-Math.PI:-1.9):p.charge===0&&p.mode==='idle'?-walk:raise;right.current.rotation.z=-0.12;}if(ll.current)ll.current.rotation.x=walk;if(rl.current)rl.current.rotation.x=-walk;});
 return <group ref={root}><mesh geometry={geo.body} castShadow><meshStandardMaterial vertexColors roughness={0.8} flatShading/></mesh><mesh ref={left} geometry={geo.arm} position={[-0.6,geo.torsoY+0.28,0]}><meshStandardMaterial vertexColors roughness={0.85}/></mesh><mesh ref={right} geometry={geo.arm} position={[0.6,geo.torsoY+0.28,0]}><meshStandardMaterial vertexColors roughness={0.85}/></mesh><mesh ref={ll} geometry={geo.leg} position={[-0.25,geo.h*0.4-config.physics.bodyY,0]}><meshStandardMaterial vertexColors roughness={0.8}/></mesh><mesh ref={rl} geometry={geo.leg} position={[0.25,geo.h*0.4-config.physics.bodyY,0]}><meshStandardMaterial vertexColors roughness={0.8}/></mesh></group>;
}
