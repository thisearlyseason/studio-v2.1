export type GlobalWaiverAudience = 'participant' | 'team';

export type GlobalWaiverDocument = {
  id: string;
  title?: string;
  type?: string;
  isActive?: boolean;
  assignedTo?: string[];
  isClubMaster?: boolean;
  isGlobal?: boolean;
  teamId?: string;
  deploymentId?: string;
  sourceGlobalDocumentId?: string;
  waiverAudience?: GlobalWaiverAudience;
  [key: string]: unknown;
};

export type GlobalWaiverDeployment = {
  deploymentId: string;
  document: GlobalWaiverDocument;
  teamDocuments: GlobalWaiverDocument[];
};

type WaiverMember = {
  id: string;
  userId?: string;
  teamId?: string;
  position?: string;
  role?: string;
  status?: string;
  parentId?: string;
  parentEmail?: string;
  guardianIds?: string[];
};

type ParticipantSignature = {
  teamId?: string;
  memberId?: string;
  documentId?: string;
  docId?: string;
};

type CoachSignature = {
  teamId?: string;
  signedBy?: string;
  waiverDocId?: string;
};

export type GlobalWaiverCompletion = {
  audience: GlobalWaiverAudience;
  required: number;
  signed: number;
  completedTeams: number;
  totalTeams: number;
  isComplete: boolean;
  teams: Array<{ teamId: string; required: number; signed: number; isComplete: boolean }>;
};

const STAFF_TERMS = ['coach', 'manager', 'staff', 'trainer', 'director', 'coordinator', 'admin'];

export function getGlobalWaiverDeploymentId(document: GlobalWaiverDocument): string {
  if (document.deploymentId) return document.deploymentId;
  if (document.sourceGlobalDocumentId) {
    return document.sourceGlobalDocumentId.replace(/_global$/, '');
  }
  const legacyMatch = document.id.match(/^(protocol_\d+)(?:_global|_\d+)$/);
  return legacyMatch?.[1] || document.id;
}

export function getGlobalWaiverAudience(document: GlobalWaiverDocument): GlobalWaiverAudience {
  return document.waiverAudience === 'team' ? 'team' : 'participant';
}

export function isActiveWaiverDocument(document: Pick<GlobalWaiverDocument, 'type' | 'isActive'>): boolean {
  return document.type === 'waiver' && document.isActive !== false;
}

export function groupGlobalWaiverDeployments(documents: GlobalWaiverDocument[]): GlobalWaiverDeployment[] {
  const groups = new Map<string, GlobalWaiverDocument[]>();
  for (const document of documents) {
    if (document.isClubMaster !== true) continue;
    const deploymentId = getGlobalWaiverDeploymentId(document);
    groups.set(deploymentId, [...(groups.get(deploymentId) || []), document]);
  }

  return Array.from(groups, ([deploymentId, copies]) => {
    const document = copies.find(copy => copy.isGlobal === true || copy.id.endsWith('_global')) || copies[0];
    const teamDocuments = copies
      .filter(copy => Boolean(copy.teamId))
      .sort((a, b) => String(a.teamId).localeCompare(String(b.teamId)));
    return { deploymentId, document, teamDocuments };
  }).sort((a, b) => String(b.document.createdAt || '').localeCompare(String(a.document.createdAt || '')));
}

export function filterGlobalWaiverDeploymentCopies(
  documents: GlobalWaiverDocument[],
  deploymentId: string
): GlobalWaiverDocument[] {
  return documents.filter(document =>
    document.isClubMaster === true && getGlobalWaiverDeploymentId(document) === deploymentId
  );
}

export function isWaiverStaffMember(member: WaiverMember): boolean {
  const descriptor = `${member.position || ''} ${member.role || ''}`.toLowerCase();
  return STAFF_TERMS.some(term => descriptor.includes(term));
}

export function getSigningMemberIds({
  user,
  members,
}: {
  user: { id: string; email?: string | null };
  members: WaiverMember[];
}): string[] {
  const email = user.email?.trim().toLowerCase();
  return members.filter(member =>
    member.userId === user.id ||
    member.parentId === user.id ||
    member.guardianIds?.includes(user.id) ||
    Boolean(email && member.parentEmail?.trim().toLowerCase() === email)
  ).map(member => member.id);
}

export function calculateGlobalWaiverCompletion({
  deployment,
  teamIds,
  members,
  participantSignatures,
  coachSignatures,
}: {
  deployment: GlobalWaiverDeployment;
  teamIds: string[];
  members: WaiverMember[];
  participantSignatures: ParticipantSignature[];
  coachSignatures: CoachSignature[];
}): GlobalWaiverCompletion {
  const audience = getGlobalWaiverAudience(deployment.document);
  const documentIdByTeam = new Map(deployment.teamDocuments.map(document => [document.teamId, document.id]));
  const uniqueTeamIds = Array.from(new Set(teamIds));

  const teams = uniqueTeamIds.map(teamId => {
    const documentId = documentIdByTeam.get(teamId);
    if (audience === 'team') {
      const hasSignature = Boolean(documentId) && coachSignatures.some(signature =>
        signature.teamId === teamId &&
        signature.waiverDocId === documentId
      );
      return { teamId, required: 1, signed: hasSignature ? 1 : 0, isComplete: hasSignature };
    }

    const eligibleMembers = members.filter(member =>
      member.teamId === teamId && member.status !== 'removed' && !isWaiverStaffMember(member)
    );
    const signedMemberIds = new Set(
      participantSignatures
        .filter(signature => signature.teamId === teamId && documentId && (signature.documentId || signature.docId) === documentId)
        .map(signature => signature.memberId)
        .filter((id): id is string => Boolean(id))
    );
    const signed = eligibleMembers.filter(member => signedMemberIds.has(member.id)).length;
    return {
      teamId,
      required: eligibleMembers.length,
      signed,
      isComplete: eligibleMembers.length === 0 || signed === eligibleMembers.length,
    };
  });

  const required = teams.reduce((total, team) => total + team.required, 0);
  const signed = teams.reduce((total, team) => total + team.signed, 0);
  const completedTeams = teams.filter(team => team.isComplete).length;
  return {
    audience,
    required,
    signed,
    completedTeams,
    totalTeams: teams.length,
    isComplete: teams.length > 0 && teams.every(team => team.isComplete),
    teams,
  };
}

export function getVisibleWaiverDocuments({
  documents,
  memberIds,
  isStaff,
}: {
  documents: GlobalWaiverDocument[];
  memberIds: string[];
  isStaff: boolean;
}): GlobalWaiverDocument[] {
  const visibleMemberIds = new Set(memberIds);
  return documents.filter(document => {
    if (!isActiveWaiverDocument(document)) return false;
    if (isStaff) return true;
    const assignedTo = document.assignedTo || [];
    return assignedTo.includes('all') || assignedTo.some(memberId => visibleMemberIds.has(memberId));
  });
}
