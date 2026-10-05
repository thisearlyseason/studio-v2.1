import type {File} from '@google-cloud/storage';

/** Clear legacy capability URLs and verify the exact previously issued tokens.
 * The emulator keeps a separate token array: its admin token-delete API is the
 * only supported way to remove entries. Never send emulator admin credentials
 * to anything except the guarded loopback demo bucket.
 */
export async function revokeMediaFileTokens(file:Pick<File,'name'|'bucket'|'getMetadata'|'setMetadata'>,{environment=process.env,fetcher=fetch}:{environment?:NodeJS.ProcessEnv;fetcher?:typeof fetch}={}){
  const host=environment.FIREBASE_STORAGE_EMULATOR_HOST,project=environment.GCLOUD_PROJECT||environment.GOOGLE_CLOUD_PROJECT;
  if(host&&(host!=='127.0.0.1:9199'||!project?.startsWith('demo-')||file.bucket.name!==`${project}.appspot.com`))throw Error('Unsafe emulator token revocation target.');
  const before=(await file.getMetadata())[0].metadata?.firebaseStorageDownloadTokens;
  const tokens=typeof before==='string'?before.split(',').filter(Boolean):[];
  if(tokens.length>20||tokens.some(value=>value.length>200))throw Error('Legacy token set exceeds bounded revocation.');
  const origin=host?`http://${host}`:'https://firebasestorage.googleapis.com';
  const route=`${origin}/v0/b/${encodeURIComponent(file.bucket.name)}/o/${encodeURIComponent(file.name)}`;
  await file.setMetadata({metadata:{firebaseStorageDownloadTokens:null}});
  const signal=AbortSignal.timeout(5000);
  if(host)for(const token of tokens){
    const response=await fetcher(route+'?delete_token='+encodeURIComponent(token),{method:'POST',headers:{Authorization:'Bearer owner'},signal});
    await response.body?.cancel();if(!response.ok)throw Error('Emulator legacy token deletion failed.');
  }
  const after=(await file.getMetadata())[0].metadata?.firebaseStorageDownloadTokens;
  const remaining=typeof after==='string'?after.split(',').filter(Boolean):[];
  if((!host&&remaining.length)||tokens.some(token=>remaining.includes(token)))throw Error('Legacy token metadata revocation did not settle.');
  for(const token of tokens){
    const response=await fetcher(route+'?alt=media&token='+encodeURIComponent(token),{method:'GET',signal});
    await response.body?.cancel();if(response.status!==403&&response.status!==404)throw Error('Previously issued media URL is still readable or unverified.');
  }
}
