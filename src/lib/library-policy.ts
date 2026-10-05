import {
  APP_DISTRIBUTION,
  isExternalPurchaseUrl,
  type AppDistribution,
} from '@/lib/app-distribution';

export const LIBRARY_FILE_LIMIT=10*1024*1024;
export const LIBRARY_STARTER_LIMIT=500*1024*1024;
export class LibraryInputError extends Error {constructor(message:string,readonly status=400){super(message);}}

export function isLibraryLinkAllowed(
  href: string,
  distribution: AppDistribution = APP_DISTRIBUTION,
) {
  return distribution === 'web' || !isExternalPurchaseUrl(href);
}

export function sanitizeLibraryFilename(value:string) {
  return value.split(/[\\/]/).at(-1)!.trim().replace(/[\r\n]+/g,'_').replace(/[^A-Za-z0-9 ._()-]/g,'_').slice(0,160)||'download';
}

export async function readLibraryBytes(request:Request) {
  const length=Number(request.headers.get('content-length')||0);
  if(length>LIBRARY_FILE_LIMIT)throw new LibraryInputError('File is too large; maximum 10 MiB.',413);
  if(!request.body)throw new LibraryInputError('File is required.');
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>LIBRARY_FILE_LIMIT)throw new LibraryInputError('File is too large; maximum 10 MiB.',413);chunks.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  if(!total)throw new LibraryInputError('File is empty.');
  return Buffer.concat(chunks,total);
}

export function validateLibraryBytes(bytes:Buffer,type:string) {
  const head=bytes.subarray(0,32);
  const valid=type==='application/pdf'?head.subarray(0,5).toString()==='%PDF-'&&bytes.subarray(-1024).includes(Buffer.from('%%EOF'))
    :type==='image/png'?bytes.length>=24&&head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    :type==='image/jpeg'?bytes.length>=4&&head[0]===255&&head[1]===216&&head[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217
    :type==='image/gif'?bytes.length>=14&&/^GIF8[79]a$/.test(head.subarray(0,6).toString())
    :type==='image/webp'?bytes.length>=20&&head.subarray(0,4).toString()==='RIFF'&&head.subarray(8,12).toString()==='WEBP'
    :false;
  if(!valid)throw new LibraryInputError('Use a PDF, JPEG, PNG, GIF, or WebP file with matching contents.');
}
