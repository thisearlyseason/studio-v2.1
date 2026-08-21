import { useMemo } from 'react';
import { useTeam, TeamDocument, TeamFile } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, where } from 'firebase/firestore';
import { differenceInYears } from 'date-fns';
import { getGlobalWaiverAudience, getSigningMemberIds, getVisibleWaiverDocuments } from '@/lib/global-waiver-policy';

export function usePendingWaivers() {
  const { activeTeam, user, isStaff, isSuperAdmin, isClubManager, members } = useTeam();
  const db = useFirestore();

  const signingMembers = useMemo(() => {
    if (!user || !members) return [];

    const signingMemberIds = new Set(getSigningMemberIds({
      user: { id: user.id, email: user.email },
      members,
    }));
    return members.filter(member => signingMemberIds.has(member.id));
  }, [members, user]);

  // We ONLY want protocols/signatures linked specifically to this team.
  // Global queries cause duplication and leak signatures across unrelated squads.
  const localFilesQuery = useMemoFirebase(() => {
    if (!db || !activeTeam?.id) return null;
    return query(collection(db, 'teams', activeTeam.id, 'files'), where('category', '==', 'Signed Certificate'));
  }, [db, activeTeam?.id]);

  const { data: localSignedFiles } = useCollection<TeamFile>(localFilesQuery);

  const allSignedFilesRaw = useMemo(() => {
    const combined = [...(localSignedFiles || [])];
    const unique = new Map();
    combined.forEach(f => unique.set(f.id, f));
    return Array.from(unique.values());
  }, [localSignedFiles]);

  const docsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'documents'), orderBy('createdAt', 'desc'));
  }, [activeTeam?.id, db]);

  const { data: documents } = useCollection<TeamDocument>(docsQuery);

  const visibleWaiverDocuments = useMemo(() => getVisibleWaiverDocuments({
    documents: documents || [],
    memberIds: signingMembers.map(member => member.id),
    isStaff: isStaff || isClubManager || isSuperAdmin,
  }) as TeamDocument[], [documents, signingMembers, isStaff, isClubManager, isSuperAdmin]);

  const visibleSignedFiles = useMemo(() => {
    const raw = allSignedFilesRaw || [];
    const docMap = new Map(documents?.map(d => [d.id, d.title]) || []);
    const memMap = new Map(members?.map(m => [m.id, m.name]) || []);

    return raw.filter(f => {
      if (isClubManager || isSuperAdmin) return true;
      if (isStaff && f.teamId === activeTeam?.id) return true;
      const myMemberIds = signingMembers.map(m => m.id);
      return f.memberId && myMemberIds.includes(f.memberId);
    }).map(f => ({
      ...f,
      resolvedDocTitle: (f.documentId ? docMap.get(f.documentId) : null) || f.name.replace('Signed Certificate:', '').trim(),
      resolvedMemberName: (f.memberId ? memMap.get(f.memberId) : null) || 'Member'
    }));
  }, [allSignedFilesRaw, isClubManager, isSuperAdmin, isStaff, activeTeam?.id, signingMembers, documents, members]);

  const realTimeSignedDocIds = useMemo(() => {
    const map: Record<string, string[]> = {};
    signingMembers.forEach(m => map[m.id] = []);
    visibleSignedFiles.forEach(f => {
      if (f.memberId && f.documentId && map[f.memberId]) {
        map[f.memberId].push(f.documentId);
      }
    });
    return map;
  }, [visibleSignedFiles, signingMembers]);

  const pendingDocs = useMemo(() => {
    if (!documents || !activeTeam || signingMembers.length === 0) return [];
    const activeDocs = documents.filter(d => d.isActive !== false && getGlobalWaiverAudience(d) === 'participant');
    return activeDocs.filter(d => {
      const isParentalWaiver = d.id === 'default_parental';
      return signingMembers.some(m => {
        const isAdult = m.birthdate && differenceInYears(new Date(), new Date(m.birthdate)) >= 18;
        if (isParentalWaiver && isAdult) return false;
        const isAssigned = d.assignedTo?.includes('all') || d.assignedTo?.includes(m.id);
        const alreadySigned = realTimeSignedDocIds[m.id]?.includes(d.id);
        return isAssigned && !alreadySigned;
      });
    });
  }, [documents, realTimeSignedDocIds, signingMembers, activeTeam]);

  return { pendingDocs, signingMembers, visibleSignedFiles, realTimeSignedDocIds, documents, visibleWaiverDocuments };
}
