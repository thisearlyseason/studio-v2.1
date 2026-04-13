const fs = require('fs');

let content = fs.readFileSync('src/app/(dashboard)/coaches-corner/page.tsx', 'utf8');

// Insert a ProtocolAnalyticsDialog component
const dialogComponent = `
function ProtocolAnalyticsDialog({ proto, activeTeam, db, members, setEditingWaiver }: { proto: any, activeTeam: any, db: any, members: any[], setEditingWaiver: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const [signedUsers, setSignedUsers] = useState<any[]>([]);
  const [unsignedUsers, setUnsignedUsers] = useState<any[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isOpen && db && activeTeam && proto) {
      const fetchStats = async () => {
        // Query archived waivers for this protocol
        const q = query(
          collection(db, 'teams', activeTeam.id, 'archived_waivers'),
          where('documentId', '==', proto.id)
        );
        const snaps = await getDocs(q);
        
        // Members who signed (we can try to map by signer name or user ID if stored. 
        // In signTeamDocument it uses memberId but in archived_waivers it might not save memberId.
        // Wait, signTeamDocument saves to 'teams', activeTeam.id, 'members', mid, 'signatures', docId.
        // Let's use collectionGroup if possible, or just look up the signatures collection for each member!
      };
      // ...
    }
  }, [isOpen, db, activeTeam, proto]);
  return null;
}
`;
