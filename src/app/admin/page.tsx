'use client';

import { useState, useCallback } from 'react';
import { useTeam } from '@/components/providers/team-provider';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, orderBy, limit } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Search, Shield, Users, CreditCard, Building2, ChevronRight, X, RefreshCw, AlertTriangle, CheckCircle2, Clock, LogOut, Loader2, ExternalLink, Copy } from 'lucide-react';

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

  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<UserResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);
  const [userTeams, setUserTeams] = useState<TeamResult[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [updatingPlan, setUpdatingPlan] = useState(false);
  const [newPlan, setNewPlan] = useState('');

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto">
            <Shield className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-3xl font-black text-white uppercase">Access Denied</h1>
          <p className="text-white/40 font-bold uppercase text-xs tracking-widest">Super Admin credentials required</p>
          <Button onClick={() => router.push('/dashboard')} className="mt-4">Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  const handleSearch = useCallback(async () => {
    if (!db || !searchTerm.trim()) return;
    setSearching(true);
    setSelectedUser(null);
    setResults([]);
    try {
      const term = searchTerm.trim().toLowerCase();
      const found: UserResult[] = [];
      const seen = new Set<string>();

      // Search by email exact match
      const emailQ = query(collection(db, 'users'), where('email', '==', term), limit(10));
      const emailSnap = await getDocs(emailQ);
      emailSnap.forEach(d => { if (!seen.has(d.id)) { seen.add(d.id); found.push({ id: d.id, ...d.data() } as UserResult); } });

      // Search by plan_type if user typed a plan name
      const planKeys = Object.keys(PLAN_LABELS);
      const matchedPlan = planKeys.find(k => k === term || PLAN_LABELS[k].label.toLowerCase() === term);
      if (matchedPlan) {
        const planQ = query(collection(db, 'users'), where('plan_type', '==', matchedPlan), limit(20));
        const planSnap = await getDocs(planQ);
        planSnap.forEach(d => { if (!seen.has(d.id)) { seen.add(d.id); found.push({ id: d.id, ...d.data() } as UserResult); } });
      }

      // Fallback: partial name match via teams ownerUserId
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

      // Attach team counts
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
  }, [db, searchTerm]);

  const loadUserDetail = useCallback(async (u: UserResult) => {
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
  }, [db]);

  const handleUpdatePlan = useCallback(async () => {
    if (!db || !selectedUser || !newPlan) return;
    setUpdatingPlan(true);
    try {
      await updateDoc(doc(db, 'users', selectedUser.id), { plan_type: newPlan });
      setSelectedUser(prev => prev ? { ...prev, plan_type: newPlan } : null);
      setResults(prev => prev.map(r => r.id === selectedUser.id ? { ...r, plan_type: newPlan } : r));
      toast({ title: 'Plan Updated', description: `${selectedUser.name || selectedUser.email} → ${PLAN_LABELS[newPlan]?.label || newPlan}` });
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    } finally {
      setUpdatingPlan(false);
    }
  }, [db, selectedUser, newPlan]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied` });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <div className="border-b border-white/10 bg-black/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-white font-black uppercase tracking-tight text-sm">Super Admin</p>
              <p className="text-white/40 text-[9px] font-bold uppercase tracking-widest">Support Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-white/30 text-[9px] font-bold uppercase tracking-widest hidden md:block">Signed in as {user?.email}</span>
            <Button size="sm" variant="ghost" className="text-white/40 hover:text-white" onClick={() => router.push('/dashboard')}>
              <LogOut className="h-4 w-4 mr-2" /> Exit Admin
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        {/* Search */}
        <div className="space-y-3">
          <h1 className="text-4xl font-black text-white uppercase tracking-tighter">Account Lookup</h1>
          <p className="text-white/30 text-xs font-bold uppercase tracking-widest">Search by email · plan type (e.g. "school") · or team name</p>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
              <Input
                className="h-14 pl-12 rounded-2xl bg-white/5 border-white/10 text-white placeholder:text-white/20 font-bold focus:border-primary/50 focus:bg-white/10"
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
              <div className="rounded-3xl border border-white/5 bg-white/3 p-12 text-center">
                <Users className="h-10 w-10 text-white/10 mx-auto mb-3" />
                <p className="text-white/20 font-bold uppercase text-[10px] tracking-widest">Search to find accounts</p>
              </div>
            )}
            {results.map(u => (
              <button
                key={u.id}
                onClick={() => loadUserDetail(u)}
                className={`w-full text-left rounded-2xl border transition-all p-5 flex items-center gap-4 group ${selectedUser?.id === u.id ? 'border-primary/40 bg-primary/10' : 'border-white/5 bg-white/3 hover:border-white/10 hover:bg-white/5'}`}
              >
                <Avatar className="h-12 w-12 rounded-xl shrink-0">
                  <AvatarImage src={u.avatar} />
                  <AvatarFallback className="rounded-xl bg-white/10 text-white font-black">{(u.name || u.email || '?')[0].toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-black text-white text-sm uppercase truncate">{u.name || '—'}</p>
                  <p className="text-white/40 text-[10px] font-bold truncate">{u.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {planBadge(u.plan_type)}
                    <span className="text-white/20 text-[9px] font-bold">{u.teamCount || 0} teams</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-white/60 shrink-0" />
              </button>
            ))}
          </div>

          {/* Detail Panel */}
          <div className="lg:col-span-3">
            {!selectedUser && (
              <div className="rounded-3xl border border-white/5 bg-white/3 p-16 text-center h-full flex flex-col items-center justify-center gap-4">
                <Shield className="h-12 w-12 text-white/10" />
                <p className="text-white/20 font-bold uppercase text-[10px] tracking-widest">Select an account to view details</p>
              </div>
            )}

            {selectedUser && (
              <div className="rounded-3xl border border-white/10 bg-white/5 overflow-hidden">
                {/* Account Header */}
                <div className="bg-black/60 p-8 flex items-start justify-between gap-4">
                  <div className="flex items-center gap-5">
                    <Avatar className="h-16 w-16 rounded-2xl border border-white/10">
                      <AvatarImage src={selectedUser.avatar} />
                      <AvatarFallback className="rounded-2xl bg-white/10 text-white font-black text-xl">
                        {(selectedUser.name || selectedUser.email || '?')[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-2xl font-black text-white uppercase tracking-tight">{selectedUser.name || '—'}</p>
                      <p className="text-white/40 text-xs font-bold">{selectedUser.email}</p>
                      <div className="flex items-center gap-2 mt-2">
                        {planBadge(selectedUser.plan_type)}
                        {selectedUser.clubName && <span className="text-white/30 text-[9px] font-bold uppercase">{selectedUser.clubName}</span>}
                        {selectedUser.schoolName && <span className="text-white/30 text-[9px] font-bold uppercase">{selectedUser.schoolName}</span>}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setSelectedUser(null)} className="text-white/20 hover:text-white transition-colors shrink-0">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="p-8 space-y-8">
                  {/* IDs */}
                  <div className="space-y-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Identifiers</p>
                    {[
                      { label: 'User UID', value: selectedUser.id },
                      { label: 'Stripe Customer', value: selectedUser.stripe_customer_id },
                      { label: 'Stripe Subscription', value: selectedUser.stripe_subscription_id },
                    ].map(({ label, value }) => value && (
                      <div key={label} className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
                        <div>
                          <p className="text-[8px] font-black uppercase text-white/30 tracking-widest">{label}</p>
                          <p className="text-white font-mono text-xs mt-0.5">{value}</p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => copyToClipboard(value, label)} className="text-white/20 hover:text-white transition-colors p-2">
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          {label === 'Stripe Customer' && (
                            <a href={`https://dashboard.stripe.com/customers/${value}`} target="_blank" rel="noopener noreferrer"
                              className="text-white/20 hover:text-white transition-colors p-2">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {label === 'Stripe Subscription' && (
                            <a href={`https://dashboard.stripe.com/subscriptions/${value}`} target="_blank" rel="noopener noreferrer"
                              className="text-white/20 hover:text-white transition-colors p-2">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Plan Management */}
                  <div className="space-y-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Subscription Management</p>
                    <div className="bg-white/5 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-black text-white uppercase">Current Plan</p>
                          <div className="mt-1">{planBadge(selectedUser.plan_type)}</div>
                        </div>
                        {selectedUser.stripe_subscription_id && (
                          <a
                            href={`https://dashboard.stripe.com/subscriptions/${selectedUser.stripe_subscription_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button size="sm" variant="outline" className="border-white/10 text-white hover:bg-white/10 rounded-xl h-9 text-[10px] font-black uppercase">
                              <ExternalLink className="h-3 w-3 mr-1.5" />Stripe Dashboard
                            </Button>
                          </a>
                        )}
                      </div>
                      <div className="flex gap-3">
                        <Select value={newPlan} onValueChange={setNewPlan}>
                          <SelectTrigger className="h-11 rounded-xl bg-white/5 border-white/10 text-white font-bold flex-1">
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
                      <p className="text-[9px] text-white/20 font-bold uppercase tracking-widest">
                        ⚠ This updates the Firestore plan field only. To change billing, use the Stripe Dashboard link above.
                      </p>
                    </div>
                  </div>

                  {/* Teams */}
                  <div className="space-y-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30">
                      Teams ({loadingDetail ? '…' : userTeams.length})
                    </p>
                    {loadingDetail ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-white/20" />
                      </div>
                    ) : userTeams.length === 0 ? (
                      <div className="bg-white/5 rounded-2xl p-6 text-center text-white/20 text-[10px] font-bold uppercase">No teams found</div>
                    ) : (
                      <div className="space-y-2">
                        {userTeams.map(t => (
                          <div key={t.id} className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
                            <div>
                              <p className="text-white font-black text-sm uppercase">{t.name}</p>
                              <p className="text-white/30 text-[9px] font-bold uppercase tracking-widest">{t.sport || t.type || '—'}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {planBadge(t.planId)}
                              {t.isPro && <span className="text-[8px] font-black uppercase text-emerald-400">Pro</span>}
                              <button onClick={() => copyToClipboard(t.id, 'Team ID')} className="text-white/20 hover:text-white p-1.5">
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
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Quick Actions</p>
                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        variant="outline"
                        className="h-12 rounded-xl border-white/10 text-white hover:bg-white/10 font-black uppercase text-[10px]"
                        onClick={() => copyToClipboard(selectedUser.id, 'User UID')}
                      >
                        <Copy className="h-3.5 w-3.5 mr-2" />Copy UID
                      </Button>
                      <Button
                        variant="outline"
                        className="h-12 rounded-xl border-white/10 text-white hover:bg-white/10 font-black uppercase text-[10px]"
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
      </div>
    </div>
  );
}
