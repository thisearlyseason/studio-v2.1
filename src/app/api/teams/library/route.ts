import {NextRequest,NextResponse} from 'next/server';
import {getStorage} from 'firebase-admin/storage';
import {adminDb,getAdminStorageBucketName} from '@/lib/firebase-admin';
import {verifyFirebaseToken} from '@/lib/api-auth';
import {getTeamAuthority} from '@/lib/server-team-access';
import {isTeamModuleEnabled} from '@/lib/team-module-visibility';
import {enforceUserRateLimit} from '@/lib/server-request-guards';
import {LibraryInputError,LIBRARY_FILE_LIMIT,LIBRARY_STARTER_LIMIT,readLibraryBytes,sanitizeLibraryFilename,validateLibraryBytes} from '@/lib/library-policy';
import {createHash} from 'node:crypto';

const validId=(value:string|null):value is string=>!!value&&/^[A-Za-z0-9_-]{1,200}$/.test(value);
const objectPath=(teamId:string,fileId:string)=>`teams/${teamId}/library/${fileId}/content`;
const object=(teamId:string,fileId:string)=>getStorage().bucket(getAdminStorageBucketName()).file(objectPath(teamId,fileId));
const privateHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
async function context(req:NextRequest,staff=false){
  const auth=await verifyFirebaseToken(req);if(auth instanceof NextResponse)return auth;
  const params=new URL(req.url).searchParams,teamId=params.get('teamId');
  if(!validId(teamId)||[...params.keys()].some(key=>!['teamId','fileId','name','category','description'].includes(key)))return NextResponse.json({error:'Invalid Library request.'},{status:400,headers:privateHeaders});
  const authority=await getTeamAuthority(teamId,auth.uid,auth.role);
  if(!authority||(!authority.isStaff&&!authority.member)||(staff&&!authority.isStaff)||!isTeamModuleEnabled({key:'files',legacyKey:'library'},authority.teamData.features))return NextResponse.json({error:'Library unavailable.'},{status:403,headers:privateHeaders});
  return{auth,params,teamId,authority};
}
function failure(error:unknown){
  if(error instanceof LibraryInputError)return NextResponse.json({error:error.message},{status:error.status,headers:privateHeaders});
  console.error('[library]',error instanceof Error?error.message:'unknown error');
  return NextResponse.json({error:'Library operation failed.'},{status:500,headers:privateHeaders});
}

export async function POST(req:NextRequest){
  try{
    const ctx=await context(req,true);if(ctx instanceof NextResponse)return ctx;
    const {auth,params,teamId,authority}=ctx;
    const limited=await enforceUserRateLimit(auth.uid,'library-upload',30,5*60*1000);if(limited)return limited;
    const name=sanitizeLibraryFilename(params.get('name')||'download'),category=params.get('category')||'Documents';
    if(!['Documents','Photos','Compliance','Other'].includes(category))throw new LibraryInputError('Use the Film workflow for videos.');
    const bytes=await readLibraryBytes(req),contentType=(req.headers.get('content-type')||'').split(';')[0];
    validateLibraryBytes(bytes,contentType);
    const files=authority.teamRef.collection('files'),ref=files.doc(),file=object(teamId,ref.id);
    await file.save(bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType,cacheControl:'private, no-store'}});
    try{
      await adminDb.runTransaction(async transaction=>{
        // Reading and updating the team serializes aggregate quota allocation.
        const current=await transaction.get(authority.teamRef),existing=await transaction.get(files);
        const total=existing.docs.reduce((sum,doc)=>sum+Math.max(0,Number(doc.data().sizeBytes)||0),0);
        if(current.data()?.isPro!==true&&total+bytes.length>LIBRARY_STARTER_LIMIT)throw new LibraryInputError('Starter Library storage exceeds 500 MiB.',413);
        transaction.create(ref,{name,type:contentType,sizeBytes:bytes.length,size:`${Math.ceil(bytes.length/1024)}KB`,url:'',storagePath:objectPath(teamId,ref.id),sha256:createHash('sha256').update(bytes).digest('hex'),contentType,category,description:(params.get('description')||'').slice(0,1000),date:new Date().toISOString(),uploadedBy:auth.uid});
        transaction.update(authority.teamRef,{libraryVersion:Number(current.data()?.libraryVersion||0)+1});
      });
    }catch(error){await file.delete({ignoreNotFound:true});throw error;}
    return NextResponse.json({fileId:ref.id},{status:201,headers:privateHeaders});
  }catch(error){return failure(error);}
}

export async function GET(req:NextRequest){
  try{
    const ctx=await context(req);if(ctx instanceof NextResponse)return ctx;
    const {params,authority,teamId}=ctx,fileId=params.get('fileId');
    if(!validId(fileId))return NextResponse.json({error:'Invalid file.'},{status:400,headers:privateHeaders});
    const snapshot=await authority.teamRef.collection('files').doc(fileId).get(),data=snapshot.data();
    if(!snapshot.exists)return NextResponse.json({error:'File unavailable.'},{status:404,headers:privateHeaders});
    let bytes:Buffer,contentType:string;
    if(data?.storagePath===objectPath(teamId,fileId)){
      const file=object(teamId,fileId);if(!(await file.exists())[0])return NextResponse.json({error:'File unavailable.'},{status:404,headers:privateHeaders});
      const [metadata]=await file.getMetadata();if(Number(metadata.size)>LIBRARY_FILE_LIMIT)throw new LibraryInputError('File unavailable.',404);
      [bytes]=await file.download();contentType=metadata.contentType||'';
    }else{
      // Read-only compatibility for old bounded Library data URLs. No migration
      // or mutation of waiver/film records is performed by this endpoint.
      const url=typeof data?.url==='string'?data.url:'';
      const comma=url.indexOf(',');
      if(comma<0||comma>80||url.length>Math.ceil(LIBRARY_FILE_LIMIT/3)*4+80)throw new LibraryInputError('File unavailable.',404);
      const header=/^data:([^;]+);base64$/.exec(url.slice(0,comma));if(!header)throw new LibraryInputError('File unavailable.',404);
      contentType=header[1];bytes=Buffer.from(url.slice(comma+1),'base64');
      if(bytes.toString('base64')!==url.slice(comma+1))throw new LibraryInputError('File unavailable.',404);
    }
    validateLibraryBytes(bytes,contentType);
    return new NextResponse(new Uint8Array(bytes),{headers:{...privateHeaders,'Content-Type':contentType,'Content-Length':String(bytes.length),'Content-Disposition':`attachment; filename="${sanitizeLibraryFilename(String(data?.name||'download'))}"`}});
  }catch(error){return failure(error);}
}

export async function DELETE(req:NextRequest){
  try{
    const ctx=await context(req,true);if(ctx instanceof NextResponse)return ctx;
    const {params,authority,teamId}=ctx,fileId=params.get('fileId');
    if(!validId(fileId))throw new LibraryInputError('Invalid file.');
    const ref=authority.teamRef.collection('files').doc(fileId),snapshot=await ref.get();
    if(!snapshot.exists)return NextResponse.json({ok:true},{headers:privateHeaders});
    if(snapshot.data()?.storagePath!==objectPath(teamId,fileId))throw new LibraryInputError('Legacy resources use their original deletion workflow.');
    await object(teamId,fileId).delete({ignoreNotFound:true});await ref.delete();
    return NextResponse.json({ok:true},{headers:privateHeaders});
  }catch(error){return failure(error);}
}
