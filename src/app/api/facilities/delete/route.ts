import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import {
  FacilityDeletionContext,
  getFacilityReferenceReasons,
} from '@/lib/facility-deletion';

const MAX_ID_LENGTH = 200;
const MAX_DELETE_WRITES = 450;
const MAX_SCANNED_RECORDS = 2_500;

type LinkedRecord = {
  path: string;
  type: 'event' | 'league';
  label: string;
  reasons: string[];
};

function cleanId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > MAX_ID_LENGTH || cleaned.includes('/')) return undefined;
  return cleaned;
}

function cleanName(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

function addSnapshotDocs(target: Map<string, any>, snapshot: any) {
  snapshot.docs.forEach((document: any) => target.set(document.ref.path, document));
}

function describeDependencies(records: LinkedRecord[]) {
  const events = records.filter(record => record.type === 'event').length;
  const leagues = records.filter(record => record.type === 'league').length;
  const examples = records.slice(0, 3).map(record => record.label);
  return { events, leagues, total: records.length, examples };
}

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const contentLength = Number(req.headers.get('content-length') || 0);
    if (contentLength > 2_048) {
      return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
    }

    const body = await req.json();
    const facilityId = cleanId(body?.facilityId);
    const fieldId = cleanId(body?.fieldId);

    if (!facilityId) {
      return NextResponse.json({ error: 'A valid facility ID is required.' }, { status: 400 });
    }

    // Global superadmin authority must come from the verified token custom
    // claim, never from a browser-writable profile document.
    const isSuperAdmin = auth.role === 'superadmin';

    const facilityRef = adminDb.collection('facilities').doc(facilityId);
    const facilitySnap = await facilityRef.get();

    if (!facilitySnap.exists) {
      return NextResponse.json({ error: 'Facility not found.' }, { status: 404 });
    }

    const facility = facilitySnap.data() || {};
    if (!isSuperAdmin && facility.clubId !== auth.uid) {
      return NextResponse.json(
        { error: 'Only the facility owner can delete this facility or its resources.' },
        { status: 403 }
      );
    }
    const facilityOwnerId = cleanId(facility.clubId);
    if (!facilityOwnerId) {
      return NextResponse.json(
        {
          error:
            'This facility has invalid legacy data and cannot be deleted safely. No records were changed.',
        },
        { status: 409 }
      );
    }

    const fieldsSnap = await facilityRef.collection('fields').get();
    const allFields = fieldsSnap.docs.map(document => ({
      id: document.id,
      name: cleanName(document.data().name),
      ref: document.ref,
    }));

    const targetField = fieldId
      ? allFields.find(field => field.id === fieldId)
      : undefined;
    if (fieldId && !targetField) {
      return NextResponse.json({ error: 'Facility resource not found.' }, { status: 404 });
    }
    if (targetField && !targetField.name) {
      return NextResponse.json(
        {
          error:
            'This facility has invalid legacy data and cannot be deleted safely. No records were changed.',
        },
        { status: 409 }
      );
    }

    const context: FacilityDeletionContext = {
      facilityId,
      facilityName: cleanName(facility.name) || 'Facility',
      fieldName: targetField?.name,
      facilityFieldNames: targetField
        ? undefined
        : allFields.map(field => field.name).filter(Boolean),
    };

    // Scan only the facility owner's organization, matching the rename path.
    // This avoids collection-group index failures while still detecting both
    // current ID-based links and legacy display-name schedule references.
    const [ownedTeams, schoolTeams, clubTeams, leaguesSnap] = await Promise.all([
      adminDb.collection('teams').where('ownerUserId', '==', facilityOwnerId).get(),
      adminDb.collection('teams').where('schoolAdminIds', 'array-contains', facilityOwnerId).get(),
      adminDb.collection('teams').where('clubId', '==', facilityOwnerId).get(),
      adminDb.collection('leagues').where('creatorId', '==', facilityOwnerId).get(),
    ]);
    const ownerTeams = new Map<string, any>();
    [ownedTeams, schoolTeams, clubTeams].forEach(snapshot =>
      addSnapshotDocs(ownerTeams, snapshot)
    );
    const eventSnapshots = await Promise.all(
      [...ownerTeams.values()].map(teamDoc => teamDoc.ref.collection('events').get())
    );
    const eventDocs = new Map<string, any>();
    eventSnapshots.forEach(snapshot => addSnapshotDocs(eventDocs, snapshot));
    const leagueDocs = new Map<string, any>();
    addSnapshotDocs(leagueDocs, leaguesSnap);

    if (eventDocs.size + leagueDocs.size > MAX_SCANNED_RECORDS) {
      return NextResponse.json(
        {
          error:
            'This facility has too many linked records to verify safely. No records were changed.',
        },
        { status: 409 }
      );
    }

    const linkedRecords: LinkedRecord[] = [];
    eventDocs.forEach(document => {
      const reasons = getFacilityReferenceReasons(document.data(), context);
      if (reasons.length === 0) return;
      linkedRecords.push({
        path: document.ref.path,
        type: 'event',
        label: cleanName(document.data().title) || `Event ${document.id}`,
        reasons,
      });
    });
    leagueDocs.forEach(document => {
      const reasons = getFacilityReferenceReasons(document.data(), context);
      if (reasons.length === 0) return;
      linkedRecords.push({
        path: document.ref.path,
        type: 'league',
        label: cleanName(document.data().name) || `League ${document.id}`,
        reasons,
      });
    });

    if (linkedRecords.length > 0) {
      return NextResponse.json(
        {
          error:
            'This resource is still in use. Reassign or remove it from the linked schedules before deleting it.',
          dependencies: describeDependencies(linkedRecords),
        },
        { status: 409 }
      );
    }

    if (allFields.length + 1 > MAX_DELETE_WRITES) {
      return NextResponse.json(
        {
          error:
            'This facility contains too many resources to delete safely in one operation. No records were changed.',
        },
        { status: 409 }
      );
    }

    const batch = adminDb.batch();
    if (targetField) {
      batch.delete(targetField.ref);
    } else {
      allFields.forEach(field => batch.delete(field.ref));
      batch.delete(facilityRef);
    }
    await batch.commit();
    return NextResponse.json({
      ok: true,
      deleted: targetField ? 'field' : 'facility',
      deletedFields: targetField ? 0 : allFields.length,
    });
  } catch (error: any) {
    console.error('[facilities/delete] Error:', error?.message || error);
    return NextResponse.json(
      { error: 'Unable to verify and delete this facility resource. No records were changed.' },
      { status: 500 }
    );
  }
}
