"use client";
import {useEffect,useState} from 'react';
import {useAuth} from '@/firebase';
import {authHeader,DEMO_EXIT_CANCELLED_EVENT,DEMO_EXIT_EVENT,getAuthToken} from '@/lib/client-auth';
import {startFeedRefresh} from '@/lib/feed-refresh';

export function useFeedRead(teamId: string | undefined, postId?: string) {
  const auth = useAuth();
  const uid = auth?.currentUser?.uid;
  const [state,setState] = useState<{key:string;data:Record<string,any>[];error:string|null;loading:boolean}>({key:'',data:[],error:null,loading:true});
  const key = `${uid || ''}:${teamId || ''}:${postId || ''}`;
  useEffect(()=>{
    if (!uid || !teamId) return;
    return startFeedRefresh({
      async load(signal) {
        const token = await getAuthToken(auth);
        if (!token) throw Error('Sign in to read the feed.');
        const response = await fetch(`/api/teams/feed/action?teamId=${encodeURIComponent(teamId)}${postId ? `&postId=${encodeURIComponent(postId)}` : ''}`,{headers:authHeader(token),signal:AbortSignal.any([signal,AbortSignal.timeout(10000)]),cache:'no-store'});
        if (!response.ok) throw Error('Feed unavailable.');
        const body = await response.json();
        return (postId ? body.comments : body.posts) || [];
      },
      onValue:data=>setState({key,data,error:null,loading:false}),
      onError:error=>setState({key,data:[],error:error instanceof Error ? error.message : 'Feed unavailable.',loading:false}),
      pauseOn:{target:window,eventName:DEMO_EXIT_EVENT,resumeEventName:DEMO_EXIT_CANCELLED_EVENT},
    });
  },[auth,uid,teamId,postId,key]);
  return state.key === key ? {data:state.data,error:state.error,isLoading:state.loading} : {data:[],error:null,isLoading:true};
}
