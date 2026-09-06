import type {MediaTarget} from './media-policy';
type Actor={uid:string;role?:string}|null;
type State={player?:Record<string,unknown>;team?:Record<string,unknown>};
export function canManageMedia(target:Pick<MediaTarget,'kind'|'subjectId'>,actor:Actor,{player,team}:State){
  if(!actor)return false;
  if(actor.role==='superadmin')return true;
  if(target.kind==='user')return actor.uid===target.subjectId;
  if(target.kind==='team')return team?.ownerUserId===actor.uid;
  return !!player&&(player.userId===actor.uid||player.parentId===actor.uid||team?.ownerUserId===actor.uid);
}
export function canReadMedia(target:Pick<MediaTarget,'kind'|'subjectId'>,actor:Actor,state:State){
  if(target.kind==='team')return !!state.team;
  if(target.kind==='player'&&state.player?.recruitingProfileEnabled===true)return true;
  if(target.kind==='user')return !!actor;
  return canManageMedia(target,actor,state);
}
export async function revokePlayerMediaTokens({setPrivate,list,clear,now=Date.now}:{setPrivate:()=>Promise<unknown>;list:()=>Promise<{paths:string[];truncated:boolean}>;clear:(path:string)=>Promise<unknown>;now?:()=>number}){
  // Never re-enable public delivery on partial cleanup failure. Every started
  // bounded SDK request settles before this function returns; a retry is safe.
  await setPrivate();const started=now(),listing=await list();let revoked=0,failed=0,index=0;
  const paths=listing.paths.slice(0,200);
  for(;index<paths.length&&now()-started<25_000;index+=4){
    const results=await Promise.allSettled(paths.slice(index,index+4).map(clear));
    for(const result of results){if(result.status==='fulfilled')revoked++;else failed++;}
  }
  const remaining=Math.max(0,paths.length-index)+(listing.truncated||listing.paths.length>200?1:0);
  return{complete:failed===0&&remaining===0,revoked,failed,remaining};
}
