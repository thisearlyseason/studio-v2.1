import {NextRequest,NextResponse} from 'next/server';
import {adminDb} from '@/lib/firebase-admin';
import {mediaActor,mediaAuthorityState,mediaFailure,mediaHeaders} from '@/lib/server-media';
import {mediaBucket} from '@/lib/server-media-storage';
import {revokeMediaFileTokens} from '@/lib/media-token-revocation';
import {canManageMedia,revokePlayerMediaTokens} from '@/lib/media-authority';
import {consumeMediaBytes,MediaInputError,parseMediaPath} from '@/lib/media-policy';

export async function POST(req:NextRequest){
  try{
    const actor=await mediaActor(req,true);if(actor instanceof NextResponse)return actor;
    if(Number(req.headers.get('content-length'))>1024)throw new MediaInputError('Invalid recruiting request.');
    const chunks:Buffer[]=[];await consumeMediaBytes(req.body,{limit:1024,signal:AbortSignal.timeout(5000),onChunk:chunk=>{chunks.push(Buffer.from(chunk));}});
    let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new MediaInputError('Invalid recruiting request.');}
    if(!data||typeof data!=='object'||Array.isArray(data))throw new MediaInputError('Invalid recruiting request.');
    if(Object.keys(data).some(key=>!['playerId','enabled'].includes(key))||typeof data.enabled!=='boolean')throw new MediaInputError('Invalid recruiting request.');
    const target=parseMediaPath(`players/${data.playerId}/avatar/authority`),state=await mediaAuthorityState(target);
    if(!canManageMedia(target,actor,state))throw new MediaInputError('Recruiting unavailable.',403);
    const player=adminDb.doc(`players/${target.subjectId}`);
    if(data.enabled){await player.update({recruitingProfileEnabled:true});return NextResponse.json({enabled:true},{headers:mediaHeaders});}
    const bucket=mediaBucket(),prefix=`players/${target.subjectId}/`;
    const result=await revokePlayerMediaTokens({
      setPrivate:()=>player.update({recruitingProfileEnabled:false}),
      list:async()=>{const [files,next]=await bucket.getFiles({prefix,maxResults:201,autoPaginate:false});return{paths:files.map(file=>file.name).filter(name=>['avatar/','thumbnails/','videos/'].some(category=>name.startsWith(prefix+category))),truncated:!!next||files.length>200};},
      clear:async path=>{if(!path.startsWith(prefix))throw new MediaInputError('Unexpected media ownership.');await revokeMediaFileTokens(bucket.file(path));},
    });
    return NextResponse.json({enabled:false,...result,...(!result.complete?{error:'Profile is private; legacy media revocation is incomplete. Retry to finish.',retryable:true}:{})},{status:result.complete?200:503,headers:mediaHeaders});
  }catch(error){return mediaFailure(error);}
}
