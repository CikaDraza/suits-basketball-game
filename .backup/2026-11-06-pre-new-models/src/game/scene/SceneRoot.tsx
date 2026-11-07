import { useLayoutEffect } from 'react';
import { Physics } from '@react-three/rapier';
import { Lighting } from './Lighting';import { CameraRig } from './CameraRig';import { Environment } from './Environment';
import { Ground } from '../entities/Ground';import { DuelArena } from '../entities/DuelArena';
import { useInputBridge } from '../../components/touch-overlay/useInputBridge';
import { exposeTestSeam } from '../harness/exposeTestSeam';import { FpsMonitor } from '../harness/FpsMonitor';
import { useHarnessStore } from '../state/harnessStore';import { useGameStore } from '../state/gameStore';import { config } from '../data/gameConfig';
export function SceneRoot({frozen=false}:{frozen?:boolean}){useInputBridge();const debug=useHarnessStore(s=>s.debugColliders);const paused=useGameStore(s=>s.screen!=='playing');useLayoutEffect(()=>{exposeTestSeam();},[]);
return <><FpsMonitor/><Lighting/><CameraRig/><Environment/><Physics gravity={config.physics.gravity as [number,number,number]} timeStep={1/config.physics.timestep} debug={debug} paused={paused||frozen}><Ground/><DuelArena/></Physics></>;}
