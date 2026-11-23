import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, assertNonAnonymous } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { getTeamAuthority } from '@/lib/server-team-access';
import { optimizeTeamCover } from '@/lib/team-cover-processing';
import { readLibraryBytes, LibraryInputError } from '@/lib/library-policy';

const headers = {'Cache-Control':'private, no-store'};
async function cover(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;
  const anonymous = assertNonAnonymous(auth);
  if (anonymous) return anonymous;
  const teamId = new URL(request.url).searchParams.get('teamId') || '';
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(teamId)) return NextResponse.json({error:'Select your club.'},{status:400});
  const team = await getTeamAuthority(teamId, auth.uid, auth.role);
  const profile = adminDb.collection('users').doc(auth.uid);
  const explicitHub = team && ['club','club_hub'].includes(team.teamData.type);
  if (!team?.isOwner || (!explicitHub &&
      !['elite','league'].includes((await profile.get()).data()?.plan_type))) {
    return NextResponse.json({error:'Only the Club Hub owner can manage this photo.'},{status:403});
  }
  const ref = profile.collection('hubBranding').doc(explicitHub ? 'club_'+teamId : 'club');
  if (request.method === 'GET') {
    const photo = (await ref.get()).data()?.photo;
    return photo ? new NextResponse(new Uint8Array(photo), {headers:{...headers,'Content-Type':'image/webp'}}) : new NextResponse(null,{status:204,headers});
  }
  if (request.method === 'DELETE') {
    await ref.delete();
    return new NextResponse(null,{status:204,headers});
  }
  let photo: Buffer;
  try {
    const versions = await optimizeTeamCover(await readLibraryBytes(request));
    const version = versions.reverse().find(v => v.data.length <= 750_000);
    if (!version) throw Error('Choose a smaller photo.');
    photo = version.data;
  } catch (error) {
    return NextResponse.json({error:error instanceof LibraryInputError ? error.message : 'Choose a supported photo at least 320 × 160 pixels.'},{status:400});
  }
  await ref.set({photo});
  return new NextResponse(new Uint8Array(photo),{headers:{...headers,'Content-Type':'image/webp'}});
}
export const GET = cover;
export const POST = cover;
export const DELETE = cover;
