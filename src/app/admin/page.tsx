'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTeam } from '@/components/providers/team-provider';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, orderBy, limit, deleteDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Search, Shield, Users, CreditCard, Building2, ChevronRight, X, RefreshCw, AlertTriangle, CheckCircle2, Clock, CheckCircle, XCircle, HelpCircle, LogOut, Loader2, ExternalLink, Copy, Bug, FileText } from 'lucide-react';

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  free:    { label: 'Free',          color: 'bg-gray-100 text-gray-700' },
  team:    { label: 'Pro Team',      color: 'bg-blue-100 text-blue-700' },
  elite:   { label: 'Elite Teams',   color: 'bg-purple-100 text-purple-700' },
  league:  { label: 'Elite League',  color: 'bg-indigo-100 text-indigo-700' },
  school:  { label: 'School',        color: 'bg-emerald-100 text-emerald-700' },
};

function planBadge(plan: string | null | undefined) {
  const p = PLAN_LABELS[plan || 'free'] || { label: plan || 'Free', color: 'bg-gray-100 text-gray-700' };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${p.color}`}>{p.label}</span>;
}

interface UserResult {
  id: string;
  name?: string;
  email?: string;
  plan_type?: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  avatar?: string;
  createdAt?: string;
  clubName?: string;
  schoolName?: string;
  teamCount?: number;
  isBetaTester?: boolean;
}

interface TeamResult {
  id: string;
  name: string;
  planId?: string;
  isPro?: boolean;
  type?: string;
  sport?: string;
  ownerUserId?: string;
}

export default function AdminPortalPage() {
  const { isSuperAdmin, user } = useTeam();
  const db = useFirestore();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'accounts' | 'beta' | 'bugs'>('accounts');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<UserResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);
  const [userTeams, setUserTeams] = useState<TeamResult[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [updatingPlan, setUpdatingPlan] = useState(false);
  const [newPlan, setNewPlan] = useState('');

  const [betaApps, setBetaApps] = useState<any[]>([]);
  const [selectedBetaApp, setSelectedBetaApp] = useState<any | null>(null);
  const [betaPassword, setBetaPassword] = useState('');
  const [betaPlanType, setBetaPlanType] = useState('free');
  const [processingBeta, setProcessingBeta] = useState(false);
  const [loadingBeta, setLoadingBeta] = useState(false);

  const [bugReports, setBugReports] = useState<any[]>([]);
  const [loadingBugs, setLoadingBugs] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin || !db) return;
    if (activeTab === 'beta') fetchBetaApps();
    if (activeTab === 'bugs') fetchBugs();
  }, [activeTab, isSuperAdmin, db]);

  const fetchBetaApps = async () => {
    setLoadingBeta(true);
    try {
      const q = query(collection(db, 'beta_applications'), orderBy('createdAt', 'desc'), limit(50));
      const snap = await getDocs(q);
      setBetaApps(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e: any) {
      toast({ title: 'Failed to load Beta Apps', description: e.message, variant: 'destructive' });
    } finally {
      setLoadingBeta(false);
    }
  };

  const fetchBugs = async () => {
    setLoadingBugs(true);
    try {
      const q = query(collection(db, 'bug_reports'), orderBy('createdAt', 'desc'), limit(50));
      const snap = await getDocs(q);
      setBugReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e: any) {
      toast({ title: 'Failed to load Bugs', description: e.message, variant: 'destructive' });
    } finally {
      setLoadingBugs(false);
    }
  };

  
  const handleApproveBeta = async () => {
    if (!selectedBetaApp || !betaPassword || !db) return;
    setProcessingBeta(true);
    try {
      // Create user via Firebase Auth REST API using the web API key
      const { firebaseConfig } = await import('@/firebase/config');
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`, {
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
        plan_type: betaPlanType,
        team_limit: betaPlanType === 'elite' ? 5 : (betaPlanType === 'league' || betaPlanType === 'school' ? 100 : (betaPlanType === 'team' ? 1 : 0)),
        createdAt: new Date().toISOString()
      });
      
      // Update beta app status
      await updateDoc(doc(db, 'beta_applications', selectedBetaApp.id), { status: 'approved' });
      
      setBetaApps(prev => prev.map(a => a.id === selectedBetaApp.id ? { ...a, status: 'approved' } : a));
      setSelectedBetaApp(null);
      setBetaPassword('');
      setBetaPlanType('free');
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

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto">
            <Shield className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white uppercase">Access Denied</h1>
          <p className="text-gray-500 dark:text-gray-900 dark:text-white/40 font-bold uppercase text-xs tracking-widest">Super Admin credentials required</p>
          <Button onClick={() => router.push('/dashboard')} className="mt-4">Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  const handleSearch = async () => {
    if (!db || !searchTerm.trim()) return;
    setSearching(true);
    setSelectedUser(null);
    setResults([]);
    try {
      const term = searchTerm.trim().toLowerCase();
      const found: UserResult[] = [];
      const seen = new Set<string>();

      const emailQ = query(collection(db, 'users'), where('email', '==', term), limit(10));
      const emailSnap = await getDocs(emailQ);
      emailSnap.forEach(d => { if (!seen.has(d.id)) { seen.add(d.id); found.push({ id: d.id, ...d.data() } as UserResult); } });

      const planKeys = Object.keys(PLAN_LABELS);
      const matchedPlan = planKeys.find(k => k === term || PLAN_LABELS[k].label.toLowerCase() === term);
      if (matchedPlan) {
        const planQ = query(collection(db, 'users'), where('plan_type', '==', matchedPlan), limit(20));
        const planSnap = await getDocs(planQ);
        planSnap.forEach(d => { if (!seen.has(d.id)) { seen.add(d.id); found.push({ id: d.id, ...d.data() } as UserResult); } });
      }

      if (found.length === 0) {
        const teamsQ = query(collection(db, 'teams'), orderBy('name'), limit(50));
        const teamsSnap = await getDocs(teamsQ);
        const ownerIds = new Set<string>();
        teamsSnap.forEach(d => {
          const data = d.data();
          if ((data.name || '').toLowerCase().includes(term) && data.ownerUserId) {
            ownerIds.add(data.ownerUserId);
          }
        });
        for (const uid of Array.from(ownerIds).slice(0, 10)) {
          if (seen.has(uid)) continue;
          const uSnap = await getDoc(doc(db, 'users', uid));
          if (uSnap.exists()) { seen.add(uid); found.push({ id: uid, ...uSnap.data() } as UserResult); }
        }
      }

      for (const u of found) {
        const tSnap = await getDocs(query(collection(db, 'teams'), where('ownerUserId', '==', u.id)));
        u.teamCount = tSnap.size;
      }

      setResults(found);
      if (found.length === 0) toast({ title: 'No accounts found', description: `No users matched "${searchTerm}"` });
    } catch (e: any) {
      toast({ title: 'Search error', description: e.message, variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  };

  const loadUserDetail = async (u: UserResult) => {
    if (!db) return;
    setLoadingDetail(true);
    setSelectedUser(u);
    setNewPlan(u.plan_type || 'free');
    try {
      const tSnap = await getDocs(query(collection(db, 'teams'), where('ownerUserId', '==', u.id)));
      setUserTeams(tSnap.docs.map(d => ({ id: d.id, ...d.data() } as TeamResult)));
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleUpdatePlan = async () => {
    if (!db || !selectedUser || !newPlan) return;
    setUpdatingPlan(true);
    try {
      const newLimit = newPlan === 'elite' ? 5 : (newPlan === 'league' || newPlan === 'school' ? 100 : (newPlan === 'team' ? 1 : 0));
      await updateDoc(doc(db, 'users', selectedUser.id), { plan_type: newPlan, team_limit: newLimit });
      setSelectedUser(prev => prev ? { ...prev, plan_type: newPlan } : null);
      setResults(prev => prev.map(r => r.id === selectedUser.id ? { ...r, plan_type: newPlan } : r));
      toast({ title: 'Plan Updated', description: `${selectedUser.name || selectedUser.email} → ${PLAN_LABELS[newPlan]?.label || newPlan}` });
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    } finally {
      setUpdatingPlan(false);
    }
  };

  const toggleBetaTester = async () => {
    if (!db || !selectedUser) return;
    const newVal = !selectedUser.isBetaTester;
    try {
      await updateDoc(doc(db, 'users', selectedUser.id), { isBetaTester: newVal });
      setSelectedUser({ ...selectedUser, isBetaTester: newVal });
      toast({ title: 'Beta Tester Updated', description: `User is now ${newVal ? 'a Beta Tester' : 'NOT a Beta Tester'}.` });
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied` });
  };

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'dark bg-[#0a0a0a]' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-white/10 bg-white/80 dark:bg-black/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center">
              <Shield className="h-5 w-5 text-gray-900 dark:text-white" />
            </div>
            <div>
              <p className="text-gray-900 dark:text-white font-black uppercase tracking-tight text-sm">Super Admin</p>
              <p className="text-gray-500 dark:text-gray-900 dark:text-white/40 text-[9px] font-bold uppercase tracking-widest">Support Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gray-400 dark:text-gray-900 dark:text-white/30 text-[9px] font-bold uppercase tracking-widest hidden md:block">Signed in as {user?.email}</span>
            <Button size="sm" variant="ghost" className="text-gray-500 dark:text-gray-500 dark:text-gray-900 dark:text-white/40 hover:text-black dark:hover:text-gray-900 dark:text-white mr-2" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
      {theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode'}
    </Button>
    <Button size="sm" variant="ghost" className="text-gray-500 dark:text-gray-500 dark:text-gray-900 dark:text-white/40 hover:text-black dark:hover:text-gray-900 dark:text-white" onClick={() => router.push('/dashboard')}>
              <LogOut className="h-4 w-4 mr-2" /> Exit Admin
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        
        {/* Tabs */}
        <div className="flex gap-4 border-b border-gray-200 dark:border-white/10 pb-4">
          <button 
            onClick={() => setActiveTab('accounts')} 
            className={`px-4 py-2 font-black uppercase tracking-widest text-xs rounded-full transition-colors ${activeTab === 'accounts' ? 'bg-white text-black' : 'text-gray-900 dark:text-white/50 hover:bg-gray-200 dark:bg-white/10 hover:text-gray-900 dark:text-white'}`}
          >
            Accounts
          </button>
          <button 
            onClick={() => setActiveTab('beta')} 
            className={`px-4 py-2 font-black uppercase tracking-widest text-xs rounded-full transition-colors flex items-center gap-2 ${activeTab === 'beta' ? 'bg-primary text-gray-900 dark:text-white' : 'text-gray-900 dark:text-white/50 hover:bg-gray-200 dark:bg-white/10 hover:text-gray-900 dark:text-white'}`}
          >
            <FileText className="w-4 h-4" /> Beta Apps
          </button>
          <button 
            onClick={() => setActiveTab('bugs')} 
            className={`px-4 py-2 font-black uppercase tracking-widest text-xs rounded-full transition-colors flex items-center gap-2 ${activeTab === 'bugs' ? 'bg-orange-500 text-gray-900 dark:text-white' : 'text-gray-900 dark:text-white/50 hover:bg-gray-200 dark:bg-white/10 hover:text-gray-900 dark:text-white'}`}
          >
            <Bug className="w-4 h-4" /> Bug Reports
          </button>
        </div>

        {activeTab === 'accounts' && (
          <>
            {/* Search */}
            <div className="space-y-3">
              <h1 className="text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Account Lookup</h1>
              <p className="text-gray-400 dark:text-gray-900 dark:text-white/30 text-xs font-bold uppercase tracking-widest">Search by email · plan type (e.g. "school") · or team name</p>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-900 dark:text-white/30" />
                  <Input
                    className="h-14 pl-12 rounded-2xl bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-900 dark:text-white placeholder:text-gray-300 dark:text-gray-900 dark:text-white/20 font-bold focus:border-primary/50 focus:bg-gray-200 dark:bg-white/10"
                    placeholder="user@email.com  ·  school  ·  Springfield High..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  />
                </div>
                <Button
                  className="h-14 px-8 rounded-2xl font-black uppercase text-xs bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20"
                  onClick={handleSearch}
                  disabled={searching || !searchTerm.trim()}
                >
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  <span className="ml-2">Search</span>
                </Button>
              </div>
            </div>

            {/* Quick Plan Filter Buttons */}
            <div className="flex flex-wrap gap-2">
              {Object.entries(PLAN_LABELS).map(([key, { label, color }]) => (
                <button
                  key={key}
                  onClick={() => { setSearchTerm(key); }}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 ${color}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Results List */}
              <div className="lg:col-span-2 space-y-3">
                {results.length === 0 && !searching && (
                  <div className="rounded-3xl border border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/3 p-12 text-center">
                    <Users className="h-10 w-10 text-gray-200 dark:text-gray-900 dark:text-white/10 mx-auto mb-3" />
                    <p className="text-gray-300 dark:text-gray-900 dark:text-white/20 font-bold uppercase text-[10px] tracking-widest">Search to find accounts</p>
                  </div>
                )}
                {results.map(u => (
                  <button
                    key={u.id}
                    onClick={() => loadUserDetail(u)}
                    className={`w-full text-left rounded-2xl border transition-all p-5 flex items-center gap-4 group ${selectedUser?.id === u.id ? 'border-primary/40 bg-primary/10' : 'border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/3 hover:border-gray-200 dark:border-white/10 hover:bg-white dark:bg-white/5'}`}
                  >
                    <Avatar className="h-12 w-12 rounded-xl shrink-0">
                      <AvatarImage src={u.avatar} />
                      <AvatarFallback className="rounded-xl bg-gray-200 dark:bg-white/10 text-gray-900 dark:text-white font-black">{(u.name || u.email || '?')[0].toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-gray-900 dark:text-white text-sm uppercase truncate">{u.name || '—'}</p>
                      <p className="text-gray-500 dark:text-gray-900 dark:text-white/40 text-[10px] font-bold truncate">{u.email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {planBadge(u.plan_type)}
                        {u.isBetaTester && <Badge className="bg-orange-500 text-gray-900 dark:text-white text-[8px] font-black uppercase px-1.5 h-4">BETA</Badge>}
                        <span className="text-gray-300 dark:text-gray-900 dark:text-white/20 text-[9px] font-bold">{u.teamCount || 0} teams</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-900 dark:text-white/20 group-hover:text-gray-900 dark:text-white/60 shrink-0" />
                  </button>
                ))}
              </div>

              {/* Detail Panel */}
              <div className="lg:col-span-3">
                {!selectedUser && (
                  <div className="rounded-3xl border border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/3 p-16 text-center h-full flex flex-col items-center justify-center gap-4">
                    <Shield className="h-12 w-12 text-gray-200 dark:text-gray-900 dark:text-white/10" />
                    <p className="text-gray-300 dark:text-gray-900 dark:text-white/20 font-bold uppercase text-[10px] tracking-widest">Select an account to view details</p>
                  </div>
                )}

                {selectedUser && (
                  <div className="rounded-3xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 overflow-hidden">
                    {/* Account Header */}
                    <div className="bg-gray-100 dark:bg-black/60 p-8 flex items-start justify-between gap-4">
                      <div className="flex items-center gap-5">
                        <Avatar className="h-16 w-16 rounded-2xl border border-gray-200 dark:border-white/10">
                          <AvatarImage src={selectedUser.avatar} />
                          <AvatarFallback className="rounded-2xl bg-gray-200 dark:bg-white/10 text-gray-900 dark:text-white font-black text-xl">
                            {(selectedUser.name || selectedUser.email || '?')[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight">{selectedUser.name || '—'}</p>
                          <p className="text-gray-500 dark:text-gray-900 dark:text-white/40 text-xs font-bold">{selectedUser.email}</p>
                          <div className="flex items-center gap-2 mt-2">
                            {planBadge(selectedUser.plan_type)}
                            {selectedUser.isBetaTester && <Badge className="bg-orange-500 text-gray-900 dark:text-white border-none font-black text-[9px] uppercase tracking-widest px-2 py-0.5">Beta Tester</Badge>}
                            {selectedUser.clubName && <span className="text-gray-400 dark:text-gray-900 dark:text-white/30 text-[9px] font-bold uppercase">{selectedUser.clubName}</span>}
                            {selectedUser.schoolName && <span className="text-gray-400 dark:text-gray-900 dark:text-white/30 text-[9px] font-bold uppercase">{selectedUser.schoolName}</span>}
                          </div>
                        </div>
                      </div>
                      <button onClick={() => setSelectedUser(null)} className="text-gray-300 dark:text-gray-900 dark:text-white/20 hover:text-gray-900 dark:text-white transition-colors shrink-0">
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="p-8 space-y-8">
                      {/* IDs */}
                      <div className="space-y-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-900 dark:text-white/30">Identifiers</p>
                        {[
                          { label: 'User UID', value: selectedUser.id },
                          { label: 'Stripe Customer', value: selectedUser.stripe_customer_id },
                          { label: 'Stripe Subscription', value: selectedUser.stripe_subscription_id },
                        ].map(({ label, value }) => value && (
                          <div key={label} className="flex items-center justify-between bg-white dark:bg-white/5 rounded-xl px-4 py-3">
                            <div>
                              <p className="text-[8px] font-black uppercase text-gray-400 dark:text-gray-900 dark:text-white/30 tracking-widest">{label}</p>
                              <p className="text-gray-900 dark:text-white font-mono text-xs mt-0.5">{value}</p>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => copyToClipboard(value, label)} className="text-gray-300 dark:text-gray-900 dark:text-white/20 hover:text-gray-900 dark:text-white transition-colors p-2">
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              {label === 'Stripe Customer' && (
                                <a href={`https://dashboard.stripe.com/customers/${value}`} target="_blank" rel="noopener noreferrer"
                                  className="text-gray-300 dark:text-gray-900 dark:text-white/20 hover:text-gray-900 dark:text-white transition-colors p-2">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}
                              {label === 'Stripe Subscription' && (
                                <a href={`https://dashboard.stripe.com/subscriptions/${value}`} target="_blank" rel="noopener noreferrer"
                                  className="text-gray-300 dark:text-gray-900 dark:text-white/20 hover:text-gray-900 dark:text-white transition-colors p-2">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Beta Tester Role Toggle */}
                      <div className="space-y-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-900 dark:text-white/30">Beta Tester Program</p>
                        <div className="bg-white dark:bg-white/5 rounded-2xl p-5 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-black text-gray-900 dark:text-white uppercase">Enable Bug Reporter</p>
                            <p className="text-gray-500 dark:text-gray-900 dark:text-white/40 text-[10px] font-bold mt-1">Grants access to global bug reporting tool</p>
                          </div>
                          <Button 
                            onClick={toggleBetaTester} 
                            variant={selectedUser.isBetaTester ? 'default' : 'outline'}
                            className={`h-10 rounded-xl font-black uppercase text-[10px] ${selectedUser.isBetaTester ? 'bg-orange-500 hover:bg-orange-600 text-gray-900 dark:text-white' : 'border-white/20 text-gray-900 dark:text-white hover:bg-gray-200 dark:bg-white/10'}`}
                          >
                            {selectedUser.isBetaTester ? 'Remove Beta Access' : 'Make Beta Tester'}
                          </Button>
                        </div>
                      </div>

                      {/* Plan Management */}
                      <div className="space-y-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-900 dark:text-white/30">Subscription Management</p>
                        <div className="bg-white dark:bg-white/5 rounded-2xl p-5 space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-black text-gray-900 dark:text-white uppercase">Current Plan</p>
                              <div className="mt-1">{planBadge(selectedUser.plan_type)}</div>
                            </div>
                            {selectedUser.stripe_subscription_id && (
                              <a
                                href={`https://dashboard.stripe.com/subscriptions/${selectedUser.stripe_subscription_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Button size="sm" variant="outline" className="border-gray-200 dark:border-white/10 text-gray-900 dark:text-white hover:bg-gray-200 dark:bg-white/10 rounded-xl h-9 text-[10px] font-black uppercase">
                                  <ExternalLink className="h-3 w-3 mr-1.5" />Stripe Dashboard
                                </Button>
                              </a>
                            )}
                          </div>
                          <div className="flex gap-3">
                            <Select value={newPlan} onValueChange={setNewPlan}>
                              <SelectTrigger className="h-11 rounded-xl bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-900 dark:text-white font-bold flex-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl">
                                {Object.entries(PLAN_LABELS).map(([key, { label }]) => (
                                  <SelectItem key={key} value={key} className="font-bold uppercase text-xs">{label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              onClick={handleUpdatePlan}
                              disabled={updatingPlan || newPlan === selectedUser.plan_type}
                              className="h-11 px-6 rounded-xl font-black uppercase text-xs bg-primary hover:bg-primary/90"
                            >
                              {updatingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                            </Button>
                          </div>
                          <p className="text-[9px] text-gray-300 dark:text-gray-900 dark:text-white/20 font-bold uppercase tracking-widest">
                            ⚠ This updates the Firestore plan field only. To change billing, use the Stripe Dashboard link above.
                          </p>
                        </div>
                      </div>

                      {/* Teams */}
                      <div className="space-y-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-900 dark:text-white/30">
                          Teams ({loadingDetail ? '…' : userTeams.length})
                        </p>
                        {loadingDetail ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-gray-300 dark:text-gray-900 dark:text-white/20" />
                          </div>
                        ) : userTeams.length === 0 ? (
                          <div className="bg-white dark:bg-white/5 rounded-2xl p-6 text-center text-gray-300 dark:text-gray-900 dark:text-white/20 text-[10px] font-bold uppercase">No teams found</div>
                        ) : (
                          <div className="space-y-2">
                            {userTeams.map(t => (
                              <div key={t.id} className="flex items-center justify-between bg-white dark:bg-white/5 rounded-xl px-4 py-3">
                                <div>
                                  <p className="text-gray-900 dark:text-white font-black text-sm uppercase">{t.name}</p>
                                  <p className="text-gray-400 dark:text-gray-900 dark:text-white/30 text-[9px] font-bold uppercase tracking-widest">{t.sport || t.type || '—'}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  {planBadge(t.planId)}
                                  {t.isPro && <span className="text-[8px] font-black uppercase text-emerald-400">Pro</span>}
                                  <button onClick={() => copyToClipboard(t.id, 'Team ID')} className="text-gray-300 dark:text-gray-900 dark:text-white/20 hover:text-gray-900 dark:text-white p-1.5">
                                    <Copy className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="space-y-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-900 dark:text-white/30">Quick Actions</p>
                        <div className="grid grid-cols-2 gap-3">
                          <Button
                            variant="outline"
                            className="h-12 rounded-xl border-gray-200 dark:border-white/10 text-gray-900 dark:text-white hover:bg-gray-200 dark:bg-white/10 font-black uppercase text-[10px]"
                            onClick={() => copyToClipboard(selectedUser.id, 'User UID')}
                          >
                            <Copy className="h-3.5 w-3.5 mr-2" />Copy UID
                          </Button>
                          <Button
                            variant="outline"
                            className="h-12 rounded-xl border-gray-200 dark:border-white/10 text-gray-900 dark:text-white hover:bg-gray-200 dark:bg-white/10 font-black uppercase text-[10px]"
                            onClick={() => loadUserDetail(selectedUser)}
                          >
                            <RefreshCw className="h-3.5 w-3.5 mr-2" />Refresh
                          </Button>
                          {selectedUser.stripe_customer_id && (
                            <a
                              href={`https://dashboard.stripe.com/customers/${selectedUser.stripe_customer_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="col-span-2"
                            >
                              <Button className="w-full h-12 rounded-xl bg-[#635BFF] hover:bg-[#4f48cc] font-black uppercase text-[10px]">
                                <CreditCard className="h-4 w-4 mr-2" />Open in Stripe
                              </Button>
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === 'beta' && (
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
              <DialogContent className="sm:max-w-6xl p-0 sm:rounded-[2.5rem] border-none shadow-2xl bg-white dark:bg-[#0a0a0a] overflow-y-auto max-h-[90vh] custom-scrollbar">
                <DialogTitle className="sr-only">Review Application</DialogTitle>
                <DialogClose asChild>
                  <Button variant="ghost" size="icon" className="absolute top-6 right-6 z-50 h-10 w-10 rounded-full border-2 border-red-500 text-black dark:text-white hover:bg-red-50 hover:text-red-600 transition-all">
                    <X className="h-5 w-5" />
                  </Button>
                </DialogClose>
                {selectedBetaApp && (
                  <div className="flex flex-col lg:flex-row">
                    
                    {/* LEFT COLUMN */}
                    <div className="w-full lg:w-1/2 bg-gray-50/50 dark:bg-white/[0.02] p-8 md:p-12 space-y-10 lg:border-r border-gray-200 dark:border-white/10">
                      <DialogHeader className="mb-8">
                        <DialogTitle className="text-3xl md:text-4xl font-black uppercase tracking-tight text-gray-900 dark:text-white">Application Review</DialogTitle>
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-white/40 mt-1">Reviewing {selectedBetaApp?.fullName || 'Applicant'}</p>
                      </DialogHeader>

                      {/* Section 1: Basic Info */}
                      <div className="space-y-6">
                        <div className="flex items-center gap-3">
                          <div className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-sm">1</div>
                          <h3 className="text-xl font-black uppercase tracking-tight text-gray-900 dark:text-white">Basic Information</h3>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Name</Label>
                            <div className="h-12 w-full flex items-center px-4 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-900 dark:text-white">{selectedBetaApp.fullName}</div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Email</Label>
                            <div className="h-12 w-full flex items-center px-4 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-900 dark:text-white truncate">{selectedBetaApp.email}</div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Role</Label>
                            <div className="h-12 w-full flex items-center px-4 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-900 dark:text-white capitalize">{selectedBetaApp.role}</div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Phone</Label>
                            <div className="h-12 w-full flex items-center px-4 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-900 dark:text-white">{selectedBetaApp.phone || 'N/A'}</div>
                          </div>
                          <div className="md:col-span-2 space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Org / Team</Label>
                            <div className="h-12 w-full flex items-center px-4 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-900 dark:text-white">{selectedBetaApp.organization}</div>
                          </div>
                        </div>
                      </div>

                      {/* Section 4: Feature Interest */}
                      <div className="space-y-6 pt-6 border-t border-gray-200 dark:border-white/10">
                        <div className="flex items-center gap-3">
                          <div className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-sm">4</div>
                          <h3 className="text-xl font-black uppercase tracking-tight text-gray-900 dark:text-white">Feature Interest</h3>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-white/40 ml-1 mb-2 block">Selected modules to test</Label>
                          <div className="flex flex-wrap gap-3">
                            {(selectedBetaApp.features || []).length > 0 ? (selectedBetaApp.features || []).map((feat, i) => (
                              <div key={i} className="px-4 py-2 rounded-xl border border-primary/30 bg-primary/5 text-primary text-sm font-bold">
                                {feat}
                              </div>
                            )) : <div className="h-12 w-full flex items-center px-4 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-400">N/A</div>}
                          </div>
                        </div>
                      </div>

                      {/* Section 5: Community */}
                      <div className="space-y-6 pt-6 border-t border-gray-200 dark:border-white/10">
                        <div className="flex items-center gap-3">
                          <div className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-sm">5</div>
                          <h3 className="text-xl font-black uppercase tracking-tight text-gray-900 dark:text-white">Community</h3>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-white/40 ml-1">How did you hear about us?</Label>
                            <div className="h-12 w-full flex items-center px-4 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-900 dark:text-white">{selectedBetaApp.referral || 'N/A'}</div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-white/40 ml-1">Social Media Handles</Label>
                            <div className="h-12 w-full flex items-center px-4 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-900 dark:text-white">{selectedBetaApp.socials || 'N/A'}</div>
                          </div>
                        </div>
                      </div>

                      {/* Admin Action Box */}
                      {selectedBetaApp.status !== 'approved' && selectedBetaApp.status !== 'denied' && (
                        <div className="mt-8 p-8 bg-white dark:bg-[#0a0a0a] border-2 border-gray-200 dark:border-white/10 rounded-[2rem] shadow-xl space-y-6 relative overflow-hidden group">
                          <div className="absolute top-0 right-0 p-8 opacity-5 -rotate-12 group-hover:scale-110 transition-transform duration-1000">
                             <Shield className="h-48 w-48 text-primary" />
                          </div>
                          <div className="relative z-10 flex items-center gap-3">
                            <Shield className="w-6 h-6 text-primary" />
                            <h4 className="text-xl font-black uppercase tracking-tight text-gray-900 dark:text-white">Admin Action</h4>
                          </div>
                          
                          <div className="relative z-10 space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-white/40 ml-1">Subscription Tier Override</Label>
                            <Select value={betaPlanType} onValueChange={setBetaPlanType}>
                              <SelectTrigger className="bg-white dark:bg-white/5 border-2 border-gray-200 dark:border-white/20 h-14 rounded-xl font-bold text-sm text-gray-900 dark:text-white focus:ring-primary shadow-inner">
                                <SelectValue placeholder="Select plan type..." />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl">
                                {Object.entries(PLAN_LABELS).map(([key, { label }]) => (
                                  <SelectItem key={key} value={key} className="font-bold uppercase text-xs">{label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="relative z-10 space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-white/40 ml-1">Assign Access Password</Label>
                            <Input 
                              value={betaPassword} 
                              onChange={(e) => setBetaPassword(e.target.value)} 
                              placeholder="Type a password for the new user account" 
                              className="bg-white dark:bg-[#0a0a0a] border-2 border-gray-200 dark:border-white/20 h-14 rounded-xl font-mono text-base focus-visible:ring-primary shadow-inner text-gray-900 dark:text-white"
                            />
                          </div>
                          <div className="relative z-10 flex flex-col gap-3 pt-2">
                            <Button 
                              className="w-full h-14 bg-[#4ade80] hover:bg-[#22c55e] text-black font-black uppercase tracking-widest text-xs sm:text-sm rounded-xl shadow-xl shadow-emerald-500/20"
                              onClick={handleApproveBeta}
                              disabled={!betaPassword || processingBeta}
                            >
                              {processingBeta ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Approve Application & Create Account'}
                            </Button>
                            <Button 
                              variant="outline"
                              className="w-full h-14 border-2 border-red-500 text-red-500 hover:bg-red-500 hover:text-white font-black uppercase tracking-widest text-xs sm:text-sm rounded-xl transition-all"
                              onClick={handleDenyBeta}
                              disabled={processingBeta}
                            >
                              Deny Request
                            </Button>
                          </div>
                        </div>
                      )}
                      {selectedBetaApp.status === 'approved' && (
                        <div className="mt-8 bg-emerald-500/10 border-2 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 p-6 rounded-[2rem] text-center space-y-2">
                          <CheckCircle className="w-8 h-8 mx-auto" />
                          <h4 className="font-black uppercase text-lg tracking-widest">Application Approved</h4>
                          <p className="text-sm font-medium">This beta tester's account has been created successfully.</p>
                        </div>
                      )}
                      {selectedBetaApp.status === 'denied' && (
                        <div className="mt-8 bg-red-500/10 border-2 border-red-500/20 text-red-600 dark:text-red-400 p-6 rounded-[2rem] text-center space-y-2">
                          <XCircle className="w-8 h-8 mx-auto" />
                          <h4 className="font-black uppercase text-lg tracking-widest">Application Denied</h4>
                          <p className="text-sm font-medium">This beta application was rejected.</p>
                        </div>
                      )}

                    </div>

                    {/* RIGHT COLUMN */}
                    <div className="w-full lg:w-1/2 p-8 md:p-12 space-y-10 bg-white dark:bg-[#0a0a0a]">
                      
                      {/* Section 2: Sports & Experience */}
                      <div className="space-y-6">
                        <div className="flex items-center gap-3">
                          <div className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-sm">2</div>
                          <h3 className="text-xl font-black uppercase tracking-tight text-gray-900 dark:text-white">Sports & Experience</h3>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Sports</Label>
                            <div className="min-h-12 w-full flex items-center px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-900 dark:text-white">{selectedBetaApp.sports}</div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Scale (Teams/Athletes)</Label>
                            <div className="min-h-12 w-full flex items-center px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-900 dark:text-white">{selectedBetaApp.scale}</div>
                          </div>
                          <div className="md:col-span-2 space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Current Tools</Label>
                            <div className="min-h-12 w-full flex items-center px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{selectedBetaApp.currentTools}</div>
                          </div>
                          <div className="md:col-span-2 space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Frustrations</Label>
                            <div className="min-h-[100px] w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-medium text-sm text-gray-900 dark:text-white whitespace-pre-wrap leading-relaxed">{selectedBetaApp.frustrations}</div>
                          </div>
                          <div className="md:col-span-2 space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Must Haves</Label>
                            <div className="min-h-[100px] w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-medium text-sm text-gray-900 dark:text-white whitespace-pre-wrap leading-relaxed">{selectedBetaApp.mustHave || 'N/A'}</div>
                          </div>
                        </div>
                      </div>

                      {/* Section 3: Quality Screening */}
                      <div className="space-y-6 pt-6 border-t border-gray-200 dark:border-white/10">
                        <div className="flex items-center gap-3">
                          <div className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-sm">3</div>
                          <h3 className="text-xl font-black uppercase tracking-tight text-gray-900 dark:text-white">Quality Screening</h3>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="md:col-span-2 space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Why Beta?</Label>
                            <div className="min-h-[100px] w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-medium text-sm text-gray-900 dark:text-white whitespace-pre-wrap leading-relaxed">{selectedBetaApp.whyBeta}</div>
                          </div>
                          
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Tested Before?</Label>
                            <div className="h-12 w-full flex items-center px-4 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-900 dark:text-white capitalize">{selectedBetaApp.tested_before || 'N/A'}</div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Expected Frequency</Label>
                            <div className="h-12 w-full flex items-center px-4 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-900 dark:text-white capitalize">{selectedBetaApp.frequency || 'N/A'}</div>
                          </div>

                          <div className="md:col-span-2 space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1 block mb-2">Devices</Label>
                            <div className="flex flex-wrap gap-3">
                              {(selectedBetaApp.devices || []).length > 0 ? (selectedBetaApp.devices || []).map((device, i) => (
                                <div key={i} className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5">
                                  <span className="w-2.5 h-2.5 rounded-full bg-primary" />
                                  <span className="text-sm font-bold text-gray-900 dark:text-white">{device}</span>
                                </div>
                              )) : <div className="h-12 w-full flex items-center px-4 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-400">N/A</div>}
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        )}
        {activeTab === 'bugs' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Bug Reports</h1>
                <p className="text-gray-400 dark:text-gray-900 dark:text-white/30 text-xs font-bold uppercase tracking-widest">Global user feedback and issues</p>
              </div>
              <Button onClick={fetchBugs} variant="outline" className="border-gray-200 dark:border-white/10 text-gray-900 dark:text-white">
                <RefreshCw className="w-4 h-4 mr-2" /> Refresh
              </Button>
            </div>
            
            {loadingBugs ? (
              <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>
            ) : bugReports.length === 0 ? (
              <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl p-12 text-center text-gray-500 dark:text-gray-900 dark:text-white/40">No bug reports found.</div>
            ) : (
              <div className="space-y-4">
                {bugReports.map(bug => (
                  <div key={bug.id} className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl p-6 flex flex-col md:flex-row gap-6 items-start">
                    <div className="w-full md:w-64 shrink-0 space-y-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">Reported By</p>
                        <p className="text-sm text-gray-900 dark:text-white">{bug.userEmail}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-900 dark:text-white/40 mt-1 font-mono break-all">{bug.userId}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">URL</p>
                        <a href={bug.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline break-all">{bug.url}</a>
                      </div>
                      <p className="text-[10px] text-gray-400 dark:text-gray-900 dark:text-white/30 font-mono mt-2">{bug.createdAt?.toDate?.()?.toLocaleString()}</p>
                    </div>
                    <div className="flex-1 space-y-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-orange-500 mb-2">Description</p>
                        <p className="text-gray-900 dark:text-white text-sm whitespace-pre-wrap">{bug.description}</p>
                      </div>
                      {bug.screenshotUrl && (
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-orange-500 mb-2">Screenshot</p>
                          <a href={bug.screenshotUrl} target="_blank" rel="noopener noreferrer">
                            <img src={bug.screenshotUrl} alt="Bug screenshot" className="max-w-xs rounded-xl border border-gray-200 dark:border-white/10 hover:border-white/30 transition-colors" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
