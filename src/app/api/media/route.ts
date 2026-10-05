import {NextRequest,NextResponse} from 'next/server';
import {Readable} from 'node:stream';
import {finished} from 'node:stream/promises';
import {randomUUID} from 'node:crypto';
import type {FileMetadata} from '@google-cloud/storage';
import sharp from 'sharp';
import {mediaBucket} from '@/lib/server-media-storage';
import {mediaResumableOptions,cancelMediaUpload,mediaUploadAbortAdapter} from '@/lib/media-resumable';
import {mediaActor,mediaAuthorityState,mediaFailure,mediaHeaders} from '@/lib/server-media';
import {canManageMedia,canReadMedia} from '@/lib/media-authority';
import {consumeMediaBytes,MediaInputError,mediaByteLimit,mediaStorageMetadata,parseMediaPath,parseMediaRange,validateMediaSignature} from '@/lib/media-policy';
import {enforceUserRateLimit} from '@/lib/server-request-guards';

function targetFor(req:NextRequest){const params=new URL(req.url).searchParams;if([...params.keys()].some(key=>key!=='path')||params.getAll('path').length!==1)throw new MediaInputError('Invalid media request.');return parseMediaPath(params.get('path')||'');}
export async function POST(req:NextRequest){
  try{
    const actor=await mediaActor(req,true);if(actor instanceof NextResponse)return actor;
    const target=targetFor(req),state=await mediaAuthorityState(target);
    if(!canManageMedia(target,actor,state))throw new MediaInputError('Media unavailable.',403);
    const limited=await enforceUserRateLimit(actor!.uid,'media-upload',30,5*60*1000);if(limited)return limited;
    const video=target.category==='videos',limit=mediaByteLimit(video),type=(req.headers.get('content-type')||'').split(';')[0];
    if(Number(req.headers.get('content-length'))>limit)throw new MediaInputError('Media exceeds the upload byte limit.',413);
    const bucket=mediaBucket(120_000),file=bucket.file(target.path),uploadId=randomUUID(),metadata=mediaStorageMetadata(type,uploadId);
    if(!video){
      const chunks:Buffer[]=[];await consumeMediaBytes(req.body,{limit,onChunk:chunk=>{chunks.push(Buffer.from(chunk));}});
      const bytes=Buffer.concat(chunks);validateMediaSignature(bytes,type,false);
      try{await sharp(bytes,{limitInputPixels:20_000_000,failOn:'warning'}).stats();}catch{throw new MediaInputError('Invalid raster image bytes.');}
      await file.save(bytes,{resumable:false,metadata});
    }else{
      if((await file.exists())[0])throw new MediaInputError('Use a new video object identity.',409);
      const pending=bucket.file(`players/${target.subjectId}/pending/${randomUUID()}`);
      const transport=mediaResumableOptions(bucket.name);
      const transportAbort=new AbortController();
      pending.interceptors.push({request:options=>({...options,uri:'uri' in options?options.uri:options.url,adapter:mediaUploadAbortAdapter(transportAbort.signal)})});
      const [uri]=await pending.createResumableUpload({metadata,preconditionOpts:{ifGenerationMatch:0}});
      // This is a newly created session, never a resume/retry. Explicit zero
      // avoids a status-query PUT that this emulator incorrectly finalizes.
      const writer=pending.createWriteStream({...transport,uri,offset:0,metadata,preconditionOpts:{ifGenerationMatch:0},timeout:120_000});
      let uploaded=false;
      const settled=finished(writer);void settled.catch(()=>{});
      const signal=AbortSignal.timeout(120_000);const abort=()=>{transportAbort.abort();writer.destroy(new Error('Media upload deadline exceeded.'));};
      signal.addEventListener('abort',abort,{once:true});let prefix=Buffer.alloc(0),validated=false;
      const write=(chunk:Uint8Array)=>new Promise<void>((resolve,reject)=>writer.write(chunk,error=>error?reject(error):resolve()));
      try{
        await consumeMediaBytes(req.body,{limit,signal,onChunk:async chunk=>{
          if(!validated){const take=Math.min(12-prefix.length,chunk.length);prefix=Buffer.concat([prefix,Buffer.from(chunk.subarray(0,take))]);if(prefix.length<12)return;validateMediaSignature(prefix,type,true);validated=true;await write(prefix);prefix=Buffer.alloc(0);if(take<chunk.length)await write(chunk.subarray(take));}else await write(chunk);
        }});
        if(!validated){validateMediaSignature(prefix,type,true);await write(prefix);}
        writer.end();await settled;uploaded=true;await pending.copy(file,{preconditionOpts:{ifGenerationMatch:0}});
      }catch(error){transportAbort.abort();writer.destroy(error instanceof Error?error:new Error('Media upload interrupted.'));await settled.catch(()=>{});if(!uploaded)await cancelMediaUpload({bucket:bucket.name,name:pending.name,uri});throw error;}
      finally{signal.removeEventListener('abort',abort);await pending.delete({ignoreNotFound:true});}
    }
    let stored:FileMetadata|undefined;
    try{
      [stored]=await file.getMetadata();
      if(stored.metadata?.firebaseStorageDownloadTokens||stored.metadata?.squadMediaUploadId!==uploadId||!/^\d+$/.test(String(stored.generation||'')))throw new MediaInputError('Media privacy verification failed.',503);
    }catch{
      // A concurrent replacement is not ours. Generation-match makes this
      // rollback safe even if another writer arrives after the metadata read.
      const owned=stored||(await file.getMetadata().catch(()=>[]))[0];
      if(owned?.metadata?.squadMediaUploadId===uploadId&&/^\d+$/.test(String(owned.generation||''))){
        try{await bucket.file(target.path,{preconditionOpts:{ifGenerationMatch:owned.generation}}).delete({ignoreNotFound:true});}catch{throw new MediaInputError('Media verification failed; owned cleanup could not settle.',503);}
      }
      throw new MediaInputError('Media privacy verification failed.',503);
    }
    return NextResponse.json({path:target.path,url:'/api/media?path='+encodeURIComponent(target.path)},{status:201,headers:mediaHeaders});
  }catch(error){return mediaFailure(error);}
}
export async function GET(req:NextRequest){
  try{
    const actor=await mediaActor(req);if(actor instanceof NextResponse)return actor;
    const target=targetFor(req),state=await mediaAuthorityState(target);
    if(!canReadMedia(target,actor,state))throw new MediaInputError('Media unavailable.',403);
    const file=mediaBucket(120_000).file(target.path);if(!(await file.exists())[0])throw new MediaInputError('Media unavailable.',404);
    const [metadata]=await file.getMetadata(),size=Number(metadata.size);
    if(!Number.isSafeInteger(size)||size<=0||size>mediaByteLimit(target.category==='videos'))throw new MediaInputError('Media unavailable.',404);
    const range=req.headers.get('range'),bounds=range?parseMediaRange(range,size):{start:0,end:size-1};
    const stream=file.createReadStream(bounds);
    const headers={...mediaHeaders,'Content-Type':metadata.contentType||'application/octet-stream','Content-Length':String(bounds.end-bounds.start+1),'Accept-Ranges':'bytes',...(range?{'Content-Range':`bytes ${bounds.start}-${bounds.end}/${size}`}:{})};
    return new NextResponse(Readable.toWeb(stream) as ReadableStream<Uint8Array>,{status:range?206:200,headers});
  }catch(error){return mediaFailure(error);}
}
export async function DELETE(req:NextRequest){
  try{
    const actor=await mediaActor(req,true);if(actor instanceof NextResponse)return actor;
    const target=targetFor(req),state=await mediaAuthorityState(target);
    if(!canManageMedia(target,actor,state))throw new MediaInputError('Media unavailable.',403);
    await mediaBucket().file(target.path).delete({ignoreNotFound:true});
    return NextResponse.json({ok:true},{headers:mediaHeaders});
  }catch(error){return mediaFailure(error);}
}
