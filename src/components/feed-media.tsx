"use client";
import {useEffect,useState} from 'react';
import {useAuth} from '@/firebase';
import {authHeader,getAuthToken} from '@/lib/client-auth';

export function FeedMedia({teamId,postId}: {teamId:string;postId:string}) {
  const auth = useAuth();
  const uid = auth?.currentUser?.uid;
  const key = `${uid}:${teamId}:${postId}`;
  const [image,setImage] = useState({key:'',url:''});
  useEffect(()=>{
    const controller = new AbortController();
    let objectUrl = '';
    void (async()=>{
      const token = await getAuthToken(auth);
      if (!token || controller.signal.aborted) return;
      const response = await fetch(`/api/teams/feed/action?teamId=${encodeURIComponent(teamId)}&postId=${encodeURIComponent(postId)}&media=1`,{headers:authHeader(token),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)]),cache:'no-store'});
      if (!response.ok) return;
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setImage({key,url:objectUrl});
    })().catch(()=>{});
    return ()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[auth,uid,teamId,postId,key]);
  return image.key === key && image.url ? <img src={image.url} className="rounded-2xl w-full h-auto object-cover max-h-[400px] lg:max-h-[600px] border" alt="Feed media"/> : null;
}
