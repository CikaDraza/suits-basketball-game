export interface AssetEntry {id:string;path:string;type:'model'|'texture'|'audio'|'image';tags?:string[]}
export const ASSET_MANIFEST:AssetEntry[]=[
 {id:'court',path:'textures/court-wood.png',type:'texture'},
 {id:'ball',path:'textures/basketball.png',type:'texture'},
 {id:'shaq',path:'images/shaq-portrait.png',type:'image'},
 {id:'chuck',path:'images/chuck-portrait.png',type:'image'}
];
