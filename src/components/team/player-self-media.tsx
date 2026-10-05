"use client";
import React,{useEffect,useRef,useState} from 'react';
import {arrayRemove,arrayUnion,doc,onSnapshot,setDoc} from 'firebase/firestore';
import {useAuth,useFirestore} from '@/firebase';
import {getAuthToken} from '@/lib/client-auth';
import {deleteScopedMedia,uploadScopedMedia} from '@/lib/media-client';
import {deleteSelfPlayerImage,selfMediaPlayerId,uploadSelfPlayerImage,type SelfMediaSubject,type SelfImageKind} from '@/lib/player-self-media';
import {PlayerSelfMediaControls,type SelfMediaProfile} from './player-self-media-controls';

export function PlayerSelfMedia({subject}:{subject:SelfMediaSubject}){
  const playerId=selfMediaPlayerId(subject);
  return playerId?<OwnedPlayerMedia key={playerId} subject={subject} playerId={playerId}/>:null;
}
function OwnedPlayerMedia({subject,playerId}:{subject:SelfMediaSubject;playerId:string}){
  const db=useFirestore(),auth=useAuth(),working=useRef(false);
  const [profile,setProfile]=useState<SelfMediaProfile>({}),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[status,setStatus]=useState('Loading player media…');
  useEffect(()=>{
    if(!db)return;
    return onSnapshot(doc(db,'players',playerId,'recruitingProfile','profile'),snapshot=>{const data=snapshot.data()||{};setProfile({photoURL:typeof data.photoURL==='string'?data.photoURL:'',photos:(Array.isArray(data.photos)?data.photos:[]).filter((value:unknown)=>typeof value==='string')});setReady(true);setStatus(current=>current==='Loading player media…'?'Ready to upload':current);},()=>{setReady(false);setStatus('Player media could not be loaded.');});
  },[db,playerId]);
  const run=async(kind:SelfImageKind,file?:File,url?:string)=>{
    if(working.current||!ready||!db)return;
    working.current=true;setBusy(true);setStatus(file?'Uploading…':'Deleting…');
    try{
      if(auth.currentUser?.uid!==subject.actorId)throw Error('Your session has changed. Reload before editing media.');
      const token=await getAuthToken(auth),deps={upload:(path:string,image:File)=>uploadScopedMedia(path,image,token),remove:(path:string)=>deleteScopedMedia(path,token),persist:async(imageKind:SelfImageKind,imageUrl:string,remove:boolean)=>{await setDoc(doc(db,'players',playerId,'recruitingProfile','profile'),imageKind==='avatar'?{photoURL:remove?'':imageUrl}:{photos:remove?arrayRemove(imageUrl):arrayUnion(imageUrl)},{merge:true});}};
      if(file){await uploadSelfPlayerImage(subject,kind,file,deps);setStatus(kind==='avatar'?'Player avatar saved':'Gallery photo saved');}
      else if(url){await deleteSelfPlayerImage(subject,kind,url,deps);setStatus(kind==='avatar'?'Player avatar deleted':'Gallery photo deleted');}
    }catch(error){setStatus(error instanceof Error?error.message:'Player media update failed.');}
    finally{working.current=false;setBusy(false);}
  };
  return <PlayerSelfMediaControls subject={subject} profile={profile} busy={busy||!ready} status={status} onUpload={(kind,file)=>{void run(kind,file);}} onDelete={(kind,url)=>{void run(kind,undefined,url);}}/>;
}
