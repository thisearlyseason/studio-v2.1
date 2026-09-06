import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {Readable,Writable} from 'node:stream';
import sharp from 'sharp';
import {communicationDb} from './communication-route-harness.mjs';

export function mediaDb(initial){
  const state=communicationDb(initial),{objects}=state;
  state.db.bucket={
    async getFiles({prefix,maxResults=200}){const names=[...objects.keys()].filter(x=>x.startsWith(prefix));return[names.slice(0,maxResults).map(name=>state.db.bucket.file(name)),names.length>maxResults?{}:null];},
    file(name){return{name,
      async exists(){return[objects.has(name)];},async getMetadata(){return[objects.get(name)?.metadata];},
      async save(bytes,options){objects.set(name,{bytes:Buffer.from(bytes),metadata:{...options.metadata,size:bytes.length}});},
      async setMetadata(value){const current=objects.get(name);current.metadata={...current.metadata,metadata:{...current.metadata.metadata,...value.metadata}};for(const [key,v]of Object.entries(current.metadata.metadata))if(v===null)delete current.metadata.metadata[key];},
      async delete(){objects.delete(name);},
      async copy(destination){if(objects.has(destination.name))throw Object.assign(Error('precondition'),{code:412});objects.set(destination.name,structuredClone(objects.get(name)));},
      createReadStream({start=0,end}={}){return Readable.from([objects.get(name).bytes.subarray(start,end===undefined?undefined:end+1)]);},
      createWriteStream(options){const chunks=[];return new Writable({write(chunk,encoding,callback){chunks.push(Buffer.from(chunk));callback();},final(callback){if(objects.has(name)&&options.preconditionOpts?.ifGenerationMatch===0){callback(Object.assign(Error('precondition'),{code:412}));return;}const bytes=Buffer.concat(chunks);objects.set(name,{bytes,metadata:{...options.metadata,size:bytes.length}});callback();}});},
    };},
  };return state;
}
export async function loadMediaRoute(relativePath,db,auth){
  const key=`media_${Date.now()}_${Math.random()}`;globalThis[key]={db,auth,sharp};
  const ref=`globalThis[${JSON.stringify(key)}]`;
  const stubs={
    'next/server':`export class NextResponse extends Response{static json(body,init={}){return new NextResponse(JSON.stringify(body),init);}}`,
    '@/lib/firebase-admin':`export const adminDb=${ref}.db;export function getAdminAuth(){return{verifySessionCookie:async()=>{if(!${ref}.auth)throw Error('invalid');return{uid:${ref}.auth.uid,email_verified:true};}};}`,
    '@/lib/api-auth':`import{NextResponse}from'next/server';export async function verifyFirebaseToken(){const a=${ref}.auth;return a&&!a.blocked?a:NextResponse.json({error:'denied'},{status:a?.blocked?403:401});}`,
    '@/lib/server-media-storage':`export const mediaBucket=()=>${ref}.db.bucket;`,
    '@/lib/media-token-revocation':`export async function revokeMediaFileTokens(file){await file.setMetadata({metadata:{firebaseStorageDownloadTokens:null}});}`,
    '@/lib/server-request-guards':`export async function enforceUserRateLimit(){return null;}`,
    'sharp':`export default ${ref}.sharp;`,
  };
  const result=await build({entryPoints:[fileURLToPath(new URL(relativePath,import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent',plugins:[{name:'media-boundaries',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(stubs,a.path)?{path:a.path,namespace:'boundary'}:null);b.onLoad({filter:/.*/,namespace:'boundary'},a=>({contents:stubs[a.path],loader:'js'}));}}]});
  const route=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  return{route,dispose(){delete globalThis[key];}};
}
