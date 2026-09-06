import type {GaxiosOptions} from 'gaxios';

// The installed SDK's duplexify drops the error when destroying its inner
// upload stream. Forward cancellation at the supported HTTP adapter boundary,
// scoped to this pending file; never mutate the shared SDK/auth client.
export function mediaUploadAbortAdapter(owned:AbortSignal):NonNullable<GaxiosOptions['adapter']>{
  return async(options,send)=>{
    const controller=new AbortController(),signals=[owned,options.signal].filter(Boolean) as AbortSignal[];
    const abort=()=>controller.abort();
    for(const signal of signals){if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});}
    try{return await send({...options,signal:controller.signal});}
    finally{for(const signal of signals)signal.removeEventListener('abort',abort);}
  };
}

const emulatorProject='demo-the-squad-rules-test';
export function mediaResumableOptions(bucket:string,environment:NodeJS.ProcessEnv=process.env){
  const host=environment.FIREBASE_STORAGE_EMULATOR_HOST;
  if(host&&(host!=='127.0.0.1:9199'||(environment.GCLOUD_PROJECT||environment.GOOGLE_CLOUD_PROJECT)!==emulatorProject||bucket!==`${emulatorProject}.appspot.com`))throw Error('Unsafe emulator media transport.');
  // This emulator finalizes every GCS PUT and ignores Content-Range. A raw
  // resumable request avoids its 130 MB multipart parser; SDK backpressure
  // still bounds client buffers. Real GCS always receives 8 MiB chunks.
  return{resumable:true,...(!host?{chunkSize:8*1024*1024}:{}),highWaterMark:64*1024};
}

/** Resumable URIs are capabilities. Keep them server-local and validate the
 * exact owned destination before any cancellation request. No retries. */
export async function cancelMediaUpload(owned:{bucket:string;name:string;uri:string},{environment=process.env,fetcher=fetch}:{environment?:NodeJS.ProcessEnv;fetcher?:typeof fetch}={}){
  mediaResumableOptions(owned.bucket,environment);
  const emulator=Boolean(environment.FIREBASE_STORAGE_EMULATOR_HOST),uri=new URL(owned.uri);
  const origin=emulator?'http://127.0.0.1:9199':'https://storage.googleapis.com';
  if(uri.origin!==origin||uri.username||uri.password||uri.hash||uri.pathname!==`/upload/storage/v1/b/${encodeURIComponent(owned.bucket)}/o`||!uri.searchParams.get('upload_id')||(uri.searchParams.has('name')&&uri.searchParams.get('name')!==owned.name))throw Error('Unsafe media session cleanup target.');
  const signal=AbortSignal.timeout(5000);
  if(emulator){
    const control=new URL(`/v0/b/${owned.bucket}/o`,origin);
    control.searchParams.set('name',owned.name);control.searchParams.set('upload_id',uri.searchParams.get('upload_id')!);control.searchParams.set('upload_protocol','resumable');
    const command=async(value:string)=>{const response=await fetcher(control,{method:'POST',headers:{Authorization:'Bearer owner','X-Goog-Upload-Command':value},signal});await response.body?.cancel();return response;};
    const before=await command('query');
    if(before.status===404||['final','cancelled'].includes(before.headers.get('x-goog-upload-status')||''))return;
    if(!before.ok||before.headers.get('x-goog-upload-status')!=='active')throw Error('Media session cleanup query failed.');
    const cancel=await command('cancel');if(!cancel.ok&&cancel.status!==404)throw Error('Media session cancellation failed.');
    const after=await command('query');
    if(after.status!==404&&(!after.ok||after.headers.get('x-goog-upload-status')!=='cancelled'))throw Error('Media session cancellation did not settle.');
  }else{
    const cancel=await fetcher(uri,{method:'DELETE',signal});await cancel.body?.cancel();
    if(![200,204,404,410,499].includes(cancel.status))throw Error('Media session cancellation failed.');
    const after=await fetcher(uri,{method:'PUT',headers:{'Content-Range':'bytes */*'},body:'',signal});await after.body?.cancel();
    if(![404,410].includes(after.status))throw Error('Media session cancellation did not settle.');
  }
}
