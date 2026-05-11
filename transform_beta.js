const fs = require('fs');
let code = fs.readFileSync('src/app/admin/page.tsx', 'utf-8');

// 1. Add imports for Icons and Dialog
if (!code.includes('CheckCircle,')) {
  code = code.replace(
    `CheckCircle2, Clock`,
    `CheckCircle2, Clock, CheckCircle, XCircle, HelpCircle`
  );
}
if (!code.includes('Dialog,')) {
  code = code.replace(
    `import { Badge } from '@/components/ui/badge';`,
    `import { Badge } from '@/components/ui/badge';\nimport { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';`
  );
}

// 2. Add state for Beta App Modal
code = code.replace(
  `const [betaApps, setBetaApps] = useState<any[]>([]);`,
  `const [betaApps, setBetaApps] = useState<any[]>([]);
  const [selectedBetaApp, setSelectedBetaApp] = useState<any | null>(null);
  const [betaPassword, setBetaPassword] = useState('');
  const [processingBeta, setProcessingBeta] = useState(false);`
);

// 3. Add handleApproveBeta and handleDenyBeta functions
const handlers = `
  const handleApproveBeta = async () => {
    if (!selectedBetaApp || !betaPassword || !db) return;
    setProcessingBeta(true);
    try {
      // Create user via Firebase Auth REST API using the web API key
      const { firebaseConfig } = await import('@/firebase/config');
      const res = await fetch(\`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=\${firebaseConfig.apiKey}\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: selectedBetaApp.email,
          password: betaPassword,
          returnSecureToken: false
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      
      const newUid = data.localId;
      
      // Create user doc in Firestore
      const { setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'users', newUid), {
        id: newUid,
        email: selectedBetaApp.email,
        fullName: selectedBetaApp.fullName,
        role: selectedBetaApp.role,
        organization: selectedBetaApp.organization,
        isBetaTester: true,
        createdAt: new Date().toISOString()
      });
      
      // Update beta app status
      await updateDoc(doc(db, 'beta_applications', selectedBetaApp.id), { status: 'approved' });
      
      setBetaApps(prev => prev.map(a => a.id === selectedBetaApp.id ? { ...a, status: 'approved' } : a));
      setSelectedBetaApp(null);
      setBetaPassword('');
      toast({ title: 'Beta User Approved', description: 'Account created successfully.' });
    } catch (e: any) {
      toast({ title: 'Approval Failed', description: e.message, variant: 'destructive' });
    } finally {
      setProcessingBeta(false);
    }
  };

  const handleDenyBeta = async () => {
    if (!selectedBetaApp || !db) return;
    setProcessingBeta(true);
    try {
      await updateDoc(doc(db, 'beta_applications', selectedBetaApp.id), { status: 'denied' });
      setBetaApps(prev => prev.map(a => a.id === selectedBetaApp.id ? { ...a, status: 'denied' } : a));
      setSelectedBetaApp(null);
      toast({ title: 'Beta App Denied' });
    } catch (e: any) {
      toast({ title: 'Update Failed', description: e.message, variant: 'destructive' });
    } finally {
      setProcessingBeta(false);
    }
  };
`;
code = code.replace(`if (!isSuperAdmin) {`, handlers + `\n  if (!isSuperAdmin) {`);

// 4. Replace the old activeTab === 'beta' section with the new card and modal
const oldBetaSectionMatch = code.match(/\{activeTab === 'beta' && \([\s\S]*?(?=\{activeTab === 'bugs')/);
if (oldBetaSectionMatch) {
  const newBetaSection = `{activeTab === 'beta' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Beta Applications</h1>
                <p className="text-gray-400 dark:text-white/30 text-xs font-bold uppercase tracking-widest">Review beta tester requests</p>
              </div>
              <Button onClick={fetchBetaApps} variant="outline" className="border-gray-200 dark:border-white/10 text-gray-900 dark:text-white">
                <RefreshCw className="w-4 h-4 mr-2" /> Refresh
              </Button>
            </div>
            
            {loadingBeta ? (
              <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : betaApps.length === 0 ? (
              <div className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl p-12 text-center text-gray-500 dark:text-white/40">No applications found.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {betaApps.map(app => (
                  <button 
                    key={app.id} 
                    onClick={() => setSelectedBetaApp(app)}
                    className="text-left hover:border-primary transition-colors bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl p-6 space-y-4 relative group"
                  >
                    <div className="absolute top-4 right-4">
                      {app.status === 'approved' ? (
                        <CheckCircle className="w-6 h-6 text-emerald-500" />
                      ) : app.status === 'denied' ? (
                        <XCircle className="w-6 h-6 text-red-500" />
                      ) : (
                        <HelpCircle className="w-6 h-6 text-orange-500" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-black text-gray-900 dark:text-white text-lg uppercase pr-8 truncate">{app.fullName}</h3>
                      <p className="text-gray-500 dark:text-white/40 text-xs font-bold truncate">{app.email}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary">Role</p>
                      <p className="text-sm text-gray-900 dark:text-white capitalize truncate">{app.role}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary">Org / Team</p>
                      <p className="text-sm text-gray-900 dark:text-white truncate">{app.organization}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary">Why Beta?</p>
                      <p className="text-xs text-gray-500 dark:text-white/70 line-clamp-2">{app.whyBeta}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            
            <Dialog open={!!selectedBetaApp} onOpenChange={(open) => !open && setSelectedBetaApp(null)}>
              <DialogContent className="bg-white dark:bg-[#0a0a0a] border-gray-200 dark:border-white/10 text-gray-900 dark:text-white max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-black uppercase tracking-tight">Review Application</DialogTitle>
                </DialogHeader>
                {selectedBetaApp && (
                  <div className="space-y-6 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary">Name</p>
                        <p className="text-sm font-bold mt-1">{selectedBetaApp.fullName}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary">Email</p>
                        <p className="text-sm font-bold mt-1">{selectedBetaApp.email}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary">Role</p>
                        <p className="text-sm font-bold mt-1 capitalize">{selectedBetaApp.role}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary">Org / Team</p>
                        <p className="text-sm font-bold mt-1">{selectedBetaApp.organization}</p>
                      </div>
                    </div>
                    
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary">Why Beta?</p>
                      <p className="text-sm mt-1 whitespace-pre-wrap">{selectedBetaApp.whyBeta}</p>
                    </div>

                    {selectedBetaApp.status !== 'approved' && selectedBetaApp.status !== 'denied' && (
                      <div className="pt-4 border-t border-gray-100 dark:border-white/10 space-y-4">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-white/40 mb-2">Assign Password</p>
                          <Input 
                            value={betaPassword} 
                            onChange={(e) => setBetaPassword(e.target.value)} 
                            placeholder="Enter password for new user" 
                            className="bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 font-mono"
                          />
                        </div>
                        <div className="flex gap-3">
                          <Button 
                            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase tracking-widest text-xs"
                            onClick={handleApproveBeta}
                            disabled={!betaPassword || processingBeta}
                          >
                            {processingBeta ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Approve & Create'}
                          </Button>
                          <Button 
                            className="flex-1 bg-red-500 hover:bg-red-600 text-white font-black uppercase tracking-widest text-xs"
                            onClick={handleDenyBeta}
                            disabled={processingBeta}
                          >
                            Deny Request
                          </Button>
                        </div>
                      </div>
                    )}
                    
                    {selectedBetaApp.status === 'approved' && (
                      <div className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 p-4 rounded-xl text-center font-black uppercase text-xs">
                        This application has been approved.
                      </div>
                    )}
                    {selectedBetaApp.status === 'denied' && (
                      <div className="bg-red-500/10 text-red-600 dark:text-red-400 p-4 rounded-xl text-center font-black uppercase text-xs">
                        This application has been denied.
                      </div>
                    )}
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        )}
        `;
  code = code.replace(oldBetaSectionMatch[0], newBetaSection);
}

// Ensure tab pills are correct based on "Accounts | BETA APPS | Bug Reports"
// The user said: "ALso the pill is white background with white text." -> which makes it invisible. Let's make it `bg-white text-black dark:bg-white dark:text-black` when active, so it pops as a white pill with black text.
code = code.replace(
  `activeTab === 'accounts' ? 'bg-white text-black' : 'text-gray-500 dark:text-white/50 hover:bg-white/10 hover:text-gray-900 dark:hover:text-white'`,
  `activeTab === 'accounts' ? 'bg-black text-white dark:bg-white dark:text-black' : 'text-gray-500 dark:text-white/50 hover:bg-gray-200 dark:hover:bg-white/10'`
);
code = code.replace(
  `activeTab === 'beta' ? 'bg-primary text-white' : 'text-gray-500 dark:text-white/50 hover:bg-white/10 hover:text-gray-900 dark:hover:text-white'`,
  `activeTab === 'beta' ? 'bg-black text-white dark:bg-white dark:text-black' : 'text-gray-500 dark:text-white/50 hover:bg-gray-200 dark:hover:bg-white/10'`
);
code = code.replace(
  `activeTab === 'bugs' ? 'bg-orange-500 text-white' : 'text-gray-500 dark:text-white/50 hover:bg-white/10 hover:text-gray-900 dark:hover:text-white'`,
  `activeTab === 'bugs' ? 'bg-black text-white dark:bg-white dark:text-black' : 'text-gray-500 dark:text-white/50 hover:bg-gray-200 dark:hover:bg-white/10'`
);

fs.writeFileSync('src/app/admin/page.tsx', code);
