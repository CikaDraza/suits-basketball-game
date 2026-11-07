import { config } from '../data/gameConfig';
export function Environment(){return <><color attach="background" args={[config.rendering.background]}/><fog attach="fog" args={[config.rendering.background,config.rendering.fogNear,config.rendering.fogFar]}/></>;}
