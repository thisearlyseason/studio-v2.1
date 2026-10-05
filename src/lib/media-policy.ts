export class MediaInputError extends Error {
  constructor(message:string,public status=400){super(message);}
}
export type MediaTarget={kind:'user'|'player'|'team';subjectId:string;category:'avatar'|'thumbnails'|'videos'|'branding';path:string};
// Existing uploads used the original filename (including spaces). Preserve
// those exact identities while still forbidding separators/control bytes.
const identifier='[A-Za-z0-9_-]{1,200}',filename='(?!\\.{1,2}$)[^/\\\\\\x00-\\x1f\\x7f]{1,240}';
export function parseMediaPath(path:string):MediaTarget{
  let match=new RegExp(`^users/(${identifier})/avatar\\.jpg$`).exec(path);
  if(match)return{kind:'user',subjectId:match[1],category:'avatar',path};
  match=new RegExp(`^players/(${identifier})/(avatar|thumbnails|videos)/(${filename})$`).exec(path);
  if(match)return{kind:'player',subjectId:match[1],category:match[2] as MediaTarget['category'],path};
  match=new RegExp(`^teams/(${identifier})/branding/(${filename})$`).exec(path);
  if(match)return{kind:'team',subjectId:match[1],category:'branding',path};
  throw new MediaInputError('Unsupported media path.');
}
export const mediaByteLimit=(video:boolean)=>video?500*1024*1024:5*1024*1024;
// Omit the token field on object creation. Some Storage implementations coerce
// a custom-metadata null into the literal, publicly guessable token "null".
// Null is a removal instruction only in the separate metadata PATCH operation.
export const mediaStorageMetadata=(contentType:string,uploadId?:string)=>({contentType,cacheControl:'private, no-store',...(uploadId?{metadata:{squadMediaUploadId:uploadId}}:{})});
export function validateMediaSignature(bytes:Uint8Array,contentType:string,video:boolean){
  const b=Buffer.from(bytes),text=(start:number,end:number)=>b.subarray(start,end).toString('ascii');
  const valid=video
    ? contentType==='video/webm'?b.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))
      : ['video/mp4','video/quicktime','video/x-m4v'].includes(contentType)&&text(4,8)==='ftyp'
    : contentType==='image/png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : contentType==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255
      : contentType==='image/gif'?['GIF87a','GIF89a'].includes(text(0,6))
      : contentType==='image/webp'?text(0,4)==='RIFF'&&text(8,12)==='WEBP':false;
  if(!valid)throw new MediaInputError('Media bytes do not match a supported content type.');
}
export async function consumeMediaBytes(body:ReadableStream<Uint8Array>|null,{limit,onChunk,signal=AbortSignal.timeout(120_000)}:{limit:number;onChunk:(chunk:Uint8Array)=>unknown|Promise<unknown>;signal?:AbortSignal}){
  if(!body)throw new MediaInputError('Media body is required.');
  const reader=body.getReader();let count=0;
  const cancel=()=>{void reader.cancel(signal.reason).catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  try{
    while(true){signal.throwIfAborted();const result=await reader.read();signal.throwIfAborted();if(result.done)break;
      count+=result.value.byteLength;if(count>limit)throw new MediaInputError('Media exceeds the upload byte limit.',413);
      await onChunk(result.value);
    }
    if(!count)throw new MediaInputError('Media body is empty.');return count;
  }catch(error){await reader.cancel().catch(()=>{});throw error;}
  finally{signal.removeEventListener('abort',cancel);reader.releaseLock();}
}
export function parseMediaRange(value:string,size:number){
  const match=/^bytes=(\d*)-(\d*)$/.exec(value);if(!match||(!match[1]&&!match[2]))throw new MediaInputError('Invalid media range.',416);
  const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
  const end=match[1]?(match[2]?Math.min(Number(match[2]),size-1):size-1):size-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=size)throw new MediaInputError('Invalid media range.',416);
  return{start,end};
}
