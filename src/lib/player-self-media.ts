import {mediaPathFromUrl} from './media-client';

export type SelfMediaSubject={actorId?:string|null;actorRole?:string;isPlayer:boolean;member:{userId?:string;playerId?:string}};
export type SelfImageKind='avatar'|'gallery';
type Dependencies={upload:(path:string,file:File)=>Promise<{path:string;url:string}>;remove:(path:string)=>Promise<void>;persist:(kind:SelfImageKind,url:string,remove:boolean)=>Promise<void>};
export function selfMediaPlayerId(subject:SelfMediaSubject){
  const id=subject.member.playerId;
  return subject.actorRole==='adult_player'&&subject.isPlayer&&subject.actorId&&subject.actorId===subject.member.userId&&typeof id==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(id)?id:null;
}
function ownImagePath(subject:SelfMediaSubject,kind:SelfImageKind,url:string){
  const id=selfMediaPlayerId(subject),path=mediaPathFromUrl(url,process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),category=kind==='avatar'?'avatar':'thumbnails';
  if(!id||!path?.startsWith(`players/${id}/${category}/`))throw Error('Only your own player image can be changed.');
  return path;
}
export async function uploadSelfPlayerImage(subject:SelfMediaSubject,kind:SelfImageKind,file:File,deps:Dependencies){
  const id=selfMediaPlayerId(subject);if(!id)throw Error('Only your own player media can be changed.');
  const path=`players/${id}/${kind==='avatar'?'avatar':'thumbnails'}/${crypto.randomUUID()}`;
  const result=await deps.upload(path,file);
  if(result.path!==path||ownImagePath(subject,kind,result.url)!==path)throw Error('Unexpected player image identity.');
  try{await deps.persist(kind,result.url,false);}
  catch(error){try{await deps.remove(path);}catch{throw Error('Profile save failed and image cleanup could not complete.');}throw error;}
  return result.url;
}
export async function deleteSelfPlayerImage(subject:SelfMediaSubject,kind:SelfImageKind,url:string,deps:Dependencies){
  const path=ownImagePath(subject,kind,url);await deps.remove(path);await deps.persist(kind,url,true);
}
