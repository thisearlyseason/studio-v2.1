import {LIBRARY_FILE_LIMIT} from './library-policy';

/** Decode FileReader output locally; fetching a data URL violates connect-src. */
export function libraryDataUrlBlob(value:string){
  const comma=value.indexOf(',');
  if(comma<0||comma>80||value.length>Math.ceil(LIBRARY_FILE_LIMIT/3)*4+80)throw new Error('Invalid or oversized Library file.');
  const match=/^data:([^;]+);base64$/.exec(value.slice(0,comma));if(!match)throw new Error('Invalid Library data.');
  const encoded=value.slice(comma+1),decoded=atob(encoded);
  if(decoded.length>LIBRARY_FILE_LIMIT||btoa(decoded)!==encoded)throw new Error('Invalid or oversized Library file.');
  const bytes=new Uint8Array(decoded.length);for(let index=0;index<decoded.length;index++)bytes[index]=decoded.charCodeAt(index);
  return new Blob([bytes],{type:match[1]});
}
