import {parseMediaPath} from './media-policy';
import {validateRasterImage} from './storage-upload-policy';
import {validatePracticeFilmFile} from './practice-content-policy';

export function mediaPathFromUrl(value:string,bucket?:string):string|null{
  try{
    if(/^\/api\/media\?path=[^&]+$/.test(value))return parseMediaPath(decodeURIComponent(value.slice('/api/media?path='.length))).path;
    if(!bucket)return null;
    const url=new URL(value),match=/^\/v0\/b\/([^/]+)\/o\/(.+)$/.exec(url.pathname);
    const local=process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS==='true'&&url.origin==='http://127.0.0.1:9199';
    if(!match||decodeURIComponent(match[1])!==bucket||(!local&&url.origin!=='https://firebasestorage.googleapis.com'))return null;
    return parseMediaPath(decodeURIComponent(match[2])).path;
  }catch{return null;}
}
export function mediaReadUrl(value:string|undefined,bucket?:string){
  if(!value)return value;
  const path=mediaPathFromUrl(value,bucket);return path?'/api/media?path='+encodeURIComponent(path):value;
}
export async function uploadScopedMedia(path:string,file:File,token:string|null){
  const target=parseMediaPath(path),error=target.category==='videos'?validatePracticeFilmFile(file):validateRasterImage(file);
  if(error)throw Error(error);if(!token)throw Error('Your session has expired.');
  const response=await fetch('/api/media?path='+encodeURIComponent(path),{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':file.type},body:file,signal:AbortSignal.timeout(120_000)});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Media upload failed.');
  if(result.path!==path||result.url!=='/api/media?path='+encodeURIComponent(path))throw Error('Media upload returned an unexpected identity.');
  return result as {path:string;url:string};
}
export async function deleteScopedMedia(path:string,token:string|null){
  parseMediaPath(path);if(!token)throw Error('Your session has expired.');
  const response=await fetch('/api/media?path='+encodeURIComponent(path),{method:'DELETE',headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15_000)});
  if(!response.ok)throw Error('Media removal failed.');
}
