import { Component,type ErrorInfo,type ReactNode,Suspense,useEffect,useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { SceneRoot } from './scene/SceneRoot';
import { useGameStore } from './state/gameStore';
import { config } from './data/gameConfig';
class SceneErrorBoundary extends Component<{children:ReactNode},{hasError:boolean}>{
 state={hasError:false};static getDerivedStateFromError(){return {hasError:true};}
 componentDidCatch(e:Error,info:ErrorInfo){console.error(e,info.componentStack);}
 render(){return this.state.hasError?null:this.props.children;}
}
export function GameCanvas(){
 const screen=useGameStore(s=>s.screen);const [frozen,setFrozen]=useState(false);
 useEffect(()=>{const id=setInterval(()=>setFrozen(!!(window as unknown as {__PAUSED__:boolean}).__PAUSED__),100);return()=>clearInterval(id);},[]);
 return <Canvas orthographic frameloop={frozen||screen!=='playing'?'demand':'always'} shadows="percentage" dpr={config.rendering.dpr} gl={{antialias:false}} camera={{position:config.camera.position as [number,number,number],zoom:40,near:0.1,far:80}} style={{position:'absolute',inset:0}}><SceneErrorBoundary><Suspense fallback={null}><SceneRoot frozen={frozen}/></Suspense></SceneErrorBoundary></Canvas>;
}
