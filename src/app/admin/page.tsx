'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTeam } from '@/components/providers/team-provider';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, orderBy, limit, deleteDoc, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Search, Shield, Users, CreditCard, Building2, ChevronRight, X, RefreshCw, AlertTriangle, CheckCircle2, Clock, CheckCircle, XCircle, HelpCircle, LogOut, Loader2, ExternalLink, Copy, Bug, FileText, Bell, Send, MapPin, BarChart3, TrendingUp, ArrowUpDown, ArrowUp, ArrowDown, Download, Mail, Newspaper, BookOpen, Rss, PenLine, ToggleLeft, ToggleRight, Globe, Star } from 'lucide-react';
import { getPlanTeamLimit } from '@/lib/plan-catalog';

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
  const { isSuperAdmin, user, firebaseUser } = useTeam();
  const db = useFirestore();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'accounts' | 'beta' | 'bugs' | 'users' | 'newsletters' | 'sports-hub'>('accounts');
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

  // Notification state
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  const [sendingNotif, setSendingNotif] = useState(false);

  // Existing-account confirmation dialog state
  const [existingAccountConfirm, setExistingAccountConfirm] = useState<{
    email: string;
    existingUid: string | null;
    pendingPlanType: string;
    pendingPassword: string;
  } | null>(null);
  const [upgradingExisting, setUpgradingExisting] = useState(false);

  // ── Users Directory state ──────────────────────────────────────────────────
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userPlanFilter, setUserPlanFilter] = useState('all');
  const [userSortField, setUserSortField] = useState<'createdAt' | 'plan_type' | 'fullName'>('createdAt');
  const [userSortDir, setUserSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  // ── Newsletter state ────────────────────────────────────────────────────────
  const [newsletters, setNewsletters] = useState<any[]>([]);
  const [loadingNewsletters, setLoadingNewsletters] = useState(false);
  const [newsletterSearch, setNewsletterSearch] = useState('');

  // ── Sports Hub admin state ───────────────────────────────────────────────────
  const [shFeeds, setShFeeds] = useState<any[]>([]);
  const [shArticles, setShArticles] = useState<any[]>([]);
  const [shNewsletters, setShNewsletters] = useState<any[]>([]);
  const [loadingSH, setLoadingSH] = useState(false);
  const [shSection, setShSection] = useState<'overview' | 'rss' | 'subscribers' | 'compose'>('overview');
  const [shFeedUrl, setShFeedUrl] = useState('');
  const [shFeedName, setShFeedName] = useState('');
  const [shFeedCategory, setShFeedCategory] = useState('General');
  const [addingFeed, setAddingFeed] = useState(false);
  const [refreshingFeed, setRefreshingFeed] = useState<string | null>(null);
  const [shComposeTitle, setShComposeTitle] = useState('');
  const [shComposeExcerpt, setShComposeExcerpt] = useState('');
  const [shComposeSection, setShComposeSection] = useState('news');
  const [shComposeCategory, setShComposeCategory] = useState('Coaching');
  const [publishingArticle, setPublishingArticle] = useState(false);
  const [loginSummary, setLoginSummary] = useState<{
    newNewsletters: number;
    newBetaApps: number;
    lastLogin: Date | null;
    dismissed: boolean;
  } | null>(null);

  // ── On-mount: check activity since last admin login ─────────────────────────
  useEffect(() => {
    if (!isSuperAdmin || !user || !db) return;
    let cancelled = false;

    const checkSinceLastLogin = async () => {
      try {
        const userRef = doc(db, 'users', user.id);
        const userSnap = await getDoc(userRef);
        const lastLoginTs: Timestamp | null = userSnap.exists()
          ? userSnap.data()?.lastAdminLoginAt ?? null
          : null;
        const lastLoginDate = lastLoginTs?.toDate?.() ?? null;

        // Query new newsletter signups since last login
        let newNewsletterCount = 0;
        let newBetaCount = 0;

        if (lastLoginDate) {
          const sinceTs = Timestamp.fromDate(lastLoginDate);
          const [nlSnap, betaSnap] = await Promise.all([
            getDocs(query(
              collection(db, 'newsletter_signups'),
              where('createdAt', '>', sinceTs),
              limit(200)
            )),
            getDocs(query(
              collection(db, 'beta_applications'),
              where('createdAt', '>', sinceTs),
              where('status', '==', 'pending'),
              limit(200)
            )),
          ]);
          newNewsletterCount = nlSnap.size;
          newBetaCount = betaSnap.size;
        } else {
          // First ever login — just count totals so the banner is useful
          const [nlSnap, betaSnap] = await Promise.all([
            getDocs(query(collection(db, 'newsletter_signups'), limit(200))),
            getDocs(query(collection(db, 'beta_applications'), where('status', '==', 'pending'), limit(200))),
          ]);
          newNewsletterCount = nlSnap.size;
          newBetaCount = betaSnap.size;
        }

        if (cancelled) return;

        // Show banner only if there's something to report
        if (newNewsletterCount > 0 || newBetaCount > 0) {
          setLoginSummary({
            newNewsletters: newNewsletterCount,
            newBetaApps: newBetaCount,
            lastLogin: lastLoginDate,
            dismissed: false,
          });
        }

        // Stamp this login time
        await updateDoc(userRef, { lastAdminLoginAt: serverTimestamp() });
      } catch (e) {
        // Silently fail — non-critical
      }
    };

    checkSinceLastLogin();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, user?.id, db]);

  useEffect(() => {
    if (!isSuperAdmin || !db) return;
    if (activeTab === 'beta') fetchBetaApps();
    if (activeTab === 'bugs') fetchBugs();
    if (activeTab === 'users') fetchAllUsers();
    if (activeTab === 'newsletters') fetchNewsletters();
    if (activeTab === 'sports-hub') fetchSportsHubData();
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

  const fetchAllUsers = async () => {
    setLoadingUsers(true);
    try {
      // Fetch up to 500 users ordered by creation date
      const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(500));
      const snap = await getDocs(q);
      setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e: any) {
      toast({ title: 'Failed to load users', description: e.message, variant: 'destructive' });
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchNewsletters = async () => {
    setLoadingNewsletters(true);
    try {
      const q = query(collection(db, 'newsletter_signups'), orderBy('createdAt', 'desc'), limit(500));
      const snap = await getDocs(q);
      setNewsletters(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e: any) {
      toast({ title: 'Failed to load newsletters', description: e.message, variant: 'destructive' });
    } finally {
      setLoadingNewsletters(false);
    }
  };

  // ── Sports Hub Firestore helpers ─────────────────────────────────────────────
  const fetchSportsHubData = async () => {
    if (!db) return;
    setLoadingSH(true);
    try {
      const [feedsSnap, articlesSnap, nlSnap] = await Promise.all([
        getDocs(query(collection(db, 'sports_hub_rss_feeds'), orderBy('createdAt', 'desc'), limit(50))),
        getDocs(query(collection(db, 'sports_hub_articles'), orderBy('publishedAt', 'desc'), limit(20))),
        getDocs(query(collection(db, 'sports_hub_newsletter_subscribers'), orderBy('subscribedAt', 'desc'), limit(200))),
      ]);
      setShFeeds(feedsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setShArticles(articlesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setShNewsletters(nlSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e: any) {
      // Collections may not exist yet — show empty state gracefully
      setShFeeds([]);
      setShArticles([]);
      setShNewsletters([]);
    } finally {
      setLoadingSH(false);
    }
  };

  const addRSSFeed = async () => {
    if (!db || !shFeedUrl.trim() || !shFeedName.trim()) return;
    setAddingFeed(true);
    try {
      await addDoc(collection(db, 'sports_hub_rss_feeds'), {
        url: shFeedUrl.trim(),
        name: shFeedName.trim(),
        category: shFeedCategory,
        isEnabled: true,
        refreshIntervalMinutes: 60,
        articleCount: 0,
        createdAt: serverTimestamp(),
        lastSyncStatus: 'pending',
      });
      setShFeedUrl('');
      setShFeedName('');
      toast({ title: '✅ Feed Added', description: `"${shFeedName}" is now being monitored.` });
      await fetchSportsHubData();
    } catch (e: any) {
      toast({ title: 'Failed to add feed', description: e.message, variant: 'destructive' });
    } finally {
      setAddingFeed(false);
    }
  };

  const triggerRSSRefresh = async (feedId: string, feedUrl: string) => {
    setRefreshingFeed(feedId);
    try {
      const res = await fetch('/api/sports-hub/rss-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await firebaseUser?.getIdToken()}` },
        body: JSON.stringify({ feedUrl, feedId, category: shFeedCategory }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: `✅ Refreshed — ${data.totalImported} articles imported`, description: `${data.rejected} rejected by content filter` });
      await updateDoc(doc(db, 'sports_hub_rss_feeds', feedId), { lastSyncAt: serverTimestamp(), lastSyncStatus: 'success', articleCount: data.totalImported });
      await fetchSportsHubData();
    } catch (e: any) {
      toast({ title: 'Refresh failed', description: e.message, variant: 'destructive' });
      await updateDoc(doc(db, 'sports_hub_rss_feeds', feedId), { lastSyncStatus: 'error' });
    } finally {
      setRefreshingFeed(null);
    }
  };

  const toggleFeedEnabled = async (feedId: string, current: boolean) => {
    try {
      await updateDoc(doc(db, 'sports_hub_rss_feeds', feedId), { isEnabled: !current });
      setShFeeds(prev => prev.map(f => f.id === feedId ? { ...f, isEnabled: !current } : f));
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    }
  };

  const deleteFeed = async (feedId: string) => {
    try {
      await deleteDoc(doc(db, 'sports_hub_rss_feeds', feedId));
      setShFeeds(prev => prev.filter(f => f.id !== feedId));
      toast({ title: 'Feed removed' });
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    }
  };

  const publishHubArticle = async () => {
    if (!db || !shComposeTitle.trim() || !shComposeExcerpt.trim()) return;
    setPublishingArticle(true);
    try {
      const slug = shComposeTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      await addDoc(collection(db, 'sports_hub_articles'), {
        title: shComposeTitle.trim(),
        excerpt: shComposeExcerpt.trim(),
        slug,
        section: shComposeSection,
        categories: [shComposeCategory],
        author: { name: user?.name || user?.email || 'The Squad Team' },
        isDraft: false,
        isFeatured: false,
        isProductUpdate: false,
        viewCount: 0,
        bookmarkCount: 0,
        readingTime: Math.ceil(shComposeExcerpt.split(' ').length / 200) || 3,
        publishedAt: new Date().toISOString(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        tableOfContents: [],
        reactionCounts: {},
        tags: [],
        content: shComposeExcerpt,
      });
      setShComposeTitle('');
      setShComposeExcerpt('');
      toast({ title: '✅ Article Published', description: `"${shComposeTitle}" is now live in the Sports Hub.` });
      setShSection('overview');
      await fetchSportsHubData();
    } catch (e: any) {
      toast({ title: 'Publish failed', description: e.message, variant: 'destructive' });
    } finally {
      setPublishingArticle(false);
    }
  };

  const markBugFixed = async (bugId: string, currentlyFixed: boolean) => {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'bug_reports', bugId), {
        fixed: !currentlyFixed,
        fixedAt: !currentlyFixed ? new Date().toISOString() : null,
      });
      setBugReports(prev =>
        prev.map(b => b.id === bugId ? { ...b, fixed: !currentlyFixed } : b)
      );
      toast({ title: !currentlyFixed ? '✅ Marked as Fixed' : 'Reopened Bug' });
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    }
  };

  const sendBetaNotification = async () => {
    if (!db || !notifTitle.trim() || !notifBody.trim()) return;
    setSendingNotif(true);
    try {
      await addDoc(collection(db, 'beta_notifications'), {
        title: notifTitle.trim(),
        body: notifBody.trim(),
        sentBy: user?.email || 'superadmin',
        sentAt: serverTimestamp(),
        type: 'broadcast',
      });
      setNotifTitle('');
      setNotifBody('');
      toast({ title: '📣 Notification Sent', description: 'All beta users will see this update.' });
    } catch (e: any) {
      toast({ title: 'Send failed', description: e.message, variant: 'destructive' });
    } finally {
      setSendingNotif(false);
    }
  };

  const handleApproveBeta = async () => {
    if (!selectedBetaApp || !betaPassword || !db) return;
    setProcessingBeta(true);
    try {
      // Attempt to create user via Firebase Auth REST API
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

      // ── Email already exists: offer plan-upgrade instead of hard failure ──
      if (data.error?.message === 'EMAIL_EXISTS') {
        // Try to look up the existing user doc by email to get their UID
        const emailQ = query(collection(db, 'users'), where('email', '==', selectedBetaApp.email), limit(1));
        const emailSnap = await getDocs(emailQ);
        const existingUid = emailSnap.empty ? null : emailSnap.docs[0].id;

        setExistingAccountConfirm({
          email: selectedBetaApp.email,
          existingUid,
          pendingPlanType: betaPlanType,
          pendingPassword: betaPassword,
        });
        return;
      }

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
        team_limit: getPlanTeamLimit(betaPlanType),
        createdAt: new Date().toISOString()
      });
      
      // Update beta app status
      await updateDoc(doc(db, 'beta_applications', selectedBetaApp.id), { status: 'approved' });

      // Send branded welcome email via Resend (fire-and-forget, don't block UI)
      if (firebaseUser) {
        firebaseUser.getIdToken().then((idToken: string) => {
          fetch('/api/email/welcome', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
              name: selectedBetaApp.fullName || selectedBetaApp.name || 'Athlete',
              email: selectedBetaApp.email,
              password: betaPassword,
              planType: betaPlanType,
            }),
          }).catch((err) => console.warn('[Welcome Email] Failed to send:', err));
        }).catch((err: any) => console.warn('[Welcome Email] Failed to get ID token:', err));
      }

      setBetaApps(prev => prev.map(a => a.id === selectedBetaApp.id ? { ...a, status: 'approved' } : a));
      setSelectedBetaApp(null);
      setBetaPassword('');
      setBetaPlanType('free');
      toast({ title: 'Beta User Approved', description: 'Account created. Welcome email sent via Resend.' });
    } catch (e: any) {
      toast({ title: 'Approval Failed', description: e.message, variant: 'destructive' });
    } finally {
      setProcessingBeta(false);
    }
  };

  // Called when admin confirms plan upgrade for an already-existing account
  const handleUpgradeExistingBeta = async () => {
    if (!existingAccountConfirm || !selectedBetaApp || !db) return;
    setUpgradingExisting(true);
    try {
      const { existingUid, pendingPlanType } = existingAccountConfirm;

      if (existingUid) {
        // Update the existing Firestore user doc
        await updateDoc(doc(db, 'users', existingUid), {
          isBetaTester: true,
          plan_type: pendingPlanType,
          team_limit: getPlanTeamLimit(pendingPlanType),
          betaUpgradedAt: new Date().toISOString(),
        });
      }

      // Mark the application as approved
      await updateDoc(doc(db, 'beta_applications', selectedBetaApp.id), {
        status: 'approved',
        note: 'Approved on existing account',
      });

      setBetaApps(prev => prev.map(a => a.id === selectedBetaApp.id ? { ...a, status: 'approved' } : a));
      setSelectedBetaApp(null);
      setBetaPassword('');
      setBetaPlanType('free');
      setExistingAccountConfirm(null);
      toast({
        title: '✅ Existing Account Upgraded',
        description: `Plan set to "${PLAN_LABELS[pendingPlanType]?.label ?? pendingPlanType}" on existing account.`,
      });
    } catch (e: any) {
      toast({ title: 'Upgrade Failed', description: e.message, variant: 'destructive' });
    } finally {
      setUpgradingExisting(false);
    }
  };

  // Direct approve for a user who already has an account — no password needed
  const handleDirectApproveExisting = async () => {
    if (!selectedBetaApp || !db) return;
    setProcessingBeta(true);
    try {
      // Look up existing user doc by email
      const emailQ = query(collection(db, 'users'), where('email', '==', selectedBetaApp.email), limit(1));
      const emailSnap = await getDocs(emailQ);

      if (!emailSnap.empty) {
        const existingUid = emailSnap.docs[0].id;
        await updateDoc(doc(db, 'users', existingUid), {
          isBetaTester: true,
          plan_type: betaPlanType,
          team_limit: getPlanTeamLimit(betaPlanType),
          betaUpgradedAt: new Date().toISOString(),
        });
      }

      await updateDoc(doc(db, 'beta_applications', selectedBetaApp.id), {
        status: 'approved',
        note: 'Approved on existing account (no new account created)',
      });

      setBetaApps(prev => prev.map(a => a.id === selectedBetaApp.id ? { ...a, status: 'approved' } : a));
      setSelectedBetaApp(null);
      setBetaPlanType('free');
      toast({
        title: '✅ Existing Account Approved',
        description: emailSnap.empty
          ? 'Application approved — no matching account found to update.'
          : `Plan upgraded to "${PLAN_LABELS[betaPlanType]?.label ?? betaPlanType}" on existing account.`,
      });
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
      const newLimit = getPlanTeamLimit(newPlan);
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

      {/* ── Existing Account Confirmation Dialog ── */}
      <Dialog open={!!existingAccountConfirm} onOpenChange={(open) => { if (!open) setExistingAccountConfirm(null); }}>
        <DialogContent className="max-w-md rounded-3xl bg-white dark:bg-[#111] border-2 border-amber-500/30 p-0 overflow-hidden">
          <div className="bg-amber-500/10 px-8 pt-8 pb-6 border-b border-amber-500/20">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <DialogTitle className="text-xl font-black uppercase tracking-tight text-gray-900 dark:text-white">
                Account Already Exists
              </DialogTitle>
            </div>
            <p className="text-sm text-gray-600 dark:text-white/60 font-medium">
              <span className="font-black text-amber-600 dark:text-amber-400">{existingAccountConfirm?.email}</span> already has a Squad account.
            </p>
          </div>
          <div className="px-8 py-6 space-y-5">
            <div className="bg-gray-50 dark:bg-white/5 rounded-2xl p-5 border border-gray-200 dark:border-white/10 space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-gray-500 dark:text-white/40">Proposed Change</p>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-xs text-gray-400 uppercase tracking-widest font-bold">New Plan</p>
                  <p className="text-base font-black text-gray-900 dark:text-white uppercase">{PLAN_LABELS[existingAccountConfirm?.pendingPlanType || 'free']?.label}</p>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-400 uppercase tracking-widest font-bold">Beta Access</p>
                  <p className="text-base font-black text-emerald-600 uppercase">Enabled ✓</p>
                </div>
              </div>
              {!existingAccountConfirm?.existingUid && (
                <p className="text-xs text-amber-600 dark:text-amber-400 font-bold bg-amber-500/10 rounded-xl px-3 py-2">
                  ⚠️ Could not find this user's Firestore profile — their plan may not update. Consider locating the account manually.
                </p>
              )}
            </div>
            <p className="text-sm text-gray-600 dark:text-white/60 font-medium leading-relaxed">
              Do you want to <strong>approve this application</strong> and upgrade their existing account to the selected plan?
            </p>
          </div>
          <DialogFooter className="px-8 pb-8 flex gap-3">
            <Button
              variant="outline"
              className="flex-1 h-12 border-2 font-black uppercase tracking-widest text-xs rounded-xl"
              onClick={() => setExistingAccountConfirm(null)}
              disabled={upgradingExisting}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 h-12 bg-amber-500 hover:bg-amber-600 text-black font-black uppercase tracking-widest text-xs rounded-xl shadow-lg shadow-amber-500/20"
              onClick={handleUpgradeExistingBeta}
              disabled={upgradingExisting}
            >
              {upgradingExisting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes, Upgrade Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


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
        
        {/* ── Activity-since-last-login banner ── */}
        {loginSummary && !loginSummary.dismissed && (
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-gradient-to-r from-violet-600 via-indigo-600 to-sky-600 text-white rounded-2xl px-6 py-4 shadow-xl shadow-indigo-500/20 animate-in slide-in-from-top-4 fade-in duration-500">
            {/* pulsing ring */}
            <div className="shrink-0 relative flex h-10 w-10 items-center justify-center">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/30" />
              <span className="relative inline-flex h-10 w-10 rounded-full bg-white/20 items-center justify-center">
                <Bell className="h-5 w-5 text-white" />
              </span>
            </div>

            <div className="flex-1 space-y-1 min-w-0">
              <p className="font-black uppercase tracking-widest text-[10px] text-white/60">
                Since your last visit{loginSummary.lastLogin ? ` · ${loginSummary.lastLogin.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ' (first login)'}
              </p>
              <div className="flex flex-wrap gap-4">
                {loginSummary.newNewsletters > 0 && (
                  <button
                    onClick={() => { setActiveTab('newsletters'); setLoginSummary(s => s ? { ...s, dismissed: true } : null); }}
                    className="flex items-center gap-2 font-black text-sm hover:text-white/80 transition-colors group"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/30 text-emerald-200 text-xs font-black group-hover:bg-emerald-400/50 transition-colors">
                      {loginSummary.newNewsletters}
                    </span>
                    New Newsletter Signup{loginSummary.newNewsletters !== 1 ? 's' : ''}
                    <ChevronRight className="h-4 w-4 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                  </button>
                )}
                {loginSummary.newBetaApps > 0 && (
                  <button
                    onClick={() => { setActiveTab('beta'); setLoginSummary(s => s ? { ...s, dismissed: true } : null); }}
                    className="flex items-center gap-2 font-black text-sm hover:text-white/80 transition-colors group"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-400/30 text-amber-200 text-xs font-black group-hover:bg-amber-400/50 transition-colors">
                      {loginSummary.newBetaApps}
                    </span>
                    New Beta Application{loginSummary.newBetaApps !== 1 ? 's' : ''} Pending
                    <ChevronRight className="h-4 w-4 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                  </button>
                )}
              </div>
            </div>

            {/* Dismiss */}
            <button
              onClick={() => setLoginSummary(s => s ? { ...s, dismissed: true } : null)}
              className="shrink-0 p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-3 border-b border-gray-200 dark:border-white/10 pb-4">
          <button 
            onClick={() => setActiveTab('accounts')} 
            className={`px-4 py-2 font-black uppercase tracking-widest text-xs rounded-full transition-colors ${activeTab === 'accounts' ? 'bg-white text-black' : 'text-gray-900 dark:text-white/50 hover:bg-gray-200 dark:bg-white/10 hover:text-gray-900 dark:text-white'}`}
          >
            Accounts
          </button>
          <button 
            onClick={() => { setActiveTab('users'); }}
            className={`px-4 py-2 font-black uppercase tracking-widest text-xs rounded-full transition-colors flex items-center gap-2 ${activeTab === 'users' ? 'bg-sky-500 text-white' : 'text-gray-900 dark:text-white/50 hover:bg-gray-200 dark:bg-white/10 hover:text-gray-900 dark:text-white'}`}
          >
            <Users className="w-4 h-4" /> Users Directory
          </button>
          <button 
            onClick={() => setActiveTab('beta')} 
            className={`px-4 py-2 font-black uppercase tracking-widest text-xs rounded-full transition-colors flex items-center gap-2 ${activeTab === 'beta' ? 'bg-primary text-gray-900 dark:text-white' : 'text-gray-900 dark:text-white/50 hover:bg-gray-200 dark:bg-white/10 hover:text-gray-900 dark:text-white'}`}
          >
            <FileText className="w-4 h-4" /> Beta Apps
          </button>
          <button 
            onClick={() => setActiveTab('bugs')} 
            className={`px-4 py-2 font-black uppercase tracking-widest text-xs rounded-full transition-colors flex items-center gap-2 ${activeTab === 'bugs' ? 'bg-orange-500 text-white' : 'text-gray-900 dark:text-white/50 hover:bg-gray-200 dark:bg-white/10 hover:text-gray-900 dark:text-white'}`}
          >
            <Bug className="w-4 h-4" /> Bug Reports
          </button>
          <button 
            onClick={() => setActiveTab('newsletters')} 
            className={`px-4 py-2 font-black uppercase tracking-widest text-xs rounded-full transition-colors flex items-center gap-2 ${activeTab === 'newsletters' ? 'bg-emerald-500 text-white' : 'text-gray-900 dark:text-white/50 hover:bg-gray-200 dark:bg-white/10 hover:text-gray-900 dark:text-white'}`}
          >
            <Newspaper className="w-4 h-4" /> Newsletters
          </button>
          <button 
            onClick={() => setActiveTab('sports-hub')} 
            className={`px-4 py-2 font-black uppercase tracking-widest text-xs rounded-full transition-colors flex items-center gap-2 ${activeTab === 'sports-hub' ? 'bg-primary text-white' : 'text-gray-900 dark:text-white/50 hover:bg-gray-200 dark:bg-white/10 hover:text-gray-900 dark:text-white'}`}
          >
            <BookOpen className="w-4 h-4" /> Sports Hub
          </button>
        </div>


        {/* ══════════ USERS DIRECTORY TAB ══════════ */}
        {activeTab === 'users' && (() => {
          // Filter out demo/guest accounts — only show real subscribers
          const realUsers = allUsers.filter(u => !u.isDemo);

          // — Derived metrics
          const PLAN_MRR: Record<string, number> = { free: 0, team: 19, elite: 49, league: 149, school: 99 };
          const paidUsers = realUsers.filter(u => u.plan_type && u.plan_type !== 'free');
          const totalMRR = paidUsers.reduce((acc, u) => acc + (PLAN_MRR[u.plan_type] ?? 0), 0);
          const betaUsers = realUsers.filter(u => u.isBetaTester);
          const cancelledUsers = realUsers.filter(u => u.cancelledAt || u.subscription_cancelled_at);

          // — Filter + search + sort
          const term = userSearch.toLowerCase();
          const filtered = realUsers
            .filter(u => {
              if (userPlanFilter !== 'all' && u.plan_type !== userPlanFilter) return false;
              if (!term) return true;
              return (
                (u.fullName || '').toLowerCase().includes(term) ||
                (u.email || '').toLowerCase().includes(term) ||
                (u.phone || '').toLowerCase().includes(term) ||
                (u.organization || '').toLowerCase().includes(term)
              );
            })
            .sort((a, b) => {
              let av = a[userSortField] ?? '';
              let bv = b[userSortField] ?? '';
              if (typeof av === 'string') av = av.toLowerCase();
              if (typeof bv === 'string') bv = bv.toLowerCase();
              if (av < bv) return userSortDir === 'asc' ? -1 : 1;
              if (av > bv) return userSortDir === 'asc' ? 1 : -1;
              return 0;
            });

          const toggleSort = (field: typeof userSortField) => {
            if (userSortField === field) setUserSortDir(d => d === 'asc' ? 'desc' : 'asc');
            else { setUserSortField(field); setUserSortDir('asc'); }
          };

          const SortIcon = ({ field }: { field: typeof userSortField }) => {
            if (userSortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
            return userSortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-sky-400" /> : <ArrowDown className="w-3 h-3 text-sky-400" />;
          };

          const fmt = (s?: string) => {
            if (!s) return '—';
            try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
            catch { return s; }
          };

          return (
            <div className="space-y-8">
              {/* Header */}
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h1 className="text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Users Directory</h1>
                  <p className="text-gray-400 dark:text-white/30 text-xs font-bold uppercase tracking-widest mt-1">
                    {loadingUsers ? 'Loading...' : `${allUsers.length} total accounts`}
                  </p>
                </div>
                <button
                  onClick={fetchAllUsers}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-500 font-black uppercase tracking-widest text-xs transition-colors"
                  disabled={loadingUsers}
                >
                  {loadingUsers ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Refresh
                </button>
              </div>

              {/* KPI Overview Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Total Users', value: allUsers.length, icon: Users, color: 'bg-sky-500/10 text-sky-500', border: 'border-sky-500/20' },
                  { label: 'Paid Subscribers', value: paidUsers.length, icon: CreditCard, color: 'bg-emerald-500/10 text-emerald-500', border: 'border-emerald-500/20' },
                  { label: 'Est. Monthly Revenue', value: `$${totalMRR.toLocaleString()}`, icon: TrendingUp, color: 'bg-violet-500/10 text-violet-500', border: 'border-violet-500/20' },
                  { label: 'Beta Testers', value: betaUsers.length, icon: Shield, color: 'bg-primary/10 text-primary', border: 'border-primary/20' },
                ].map(card => (
                  <div key={card.label} className={`rounded-2xl border-2 ${card.border} bg-white dark:bg-white/5 p-5 space-y-3`}>
                    <div className={`w-9 h-9 rounded-xl ${card.color} flex items-center justify-center`}>
                      <card.icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-2xl font-black text-gray-900 dark:text-white">{card.value}</p>
                      <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-white/30 mt-0.5">{card.label}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Plan Breakdown Bar */}
              <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-200 dark:border-white/10 p-6 space-y-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-white/30">Subscription Breakdown</p>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {Object.entries(PLAN_LABELS).map(([key, { label, color }]) => {
                    const count = allUsers.filter(u => (u.plan_type ?? 'free') === key).length;
                    const pct = allUsers.length ? Math.round((count / allUsers.length) * 100) : 0;
                    return (
                      <button
                        key={key}
                        onClick={() => setUserPlanFilter(userPlanFilter === key ? 'all' : key)}
                        className={`rounded-xl p-3 border-2 text-left transition-all ${userPlanFilter === key ? 'border-primary scale-105' : 'border-gray-200 dark:border-white/10'}`}
                      >
                        <p className="text-lg font-black text-gray-900 dark:text-white">{count}</p>
                        <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-white/10 mt-2 mb-1.5">
                          <div className="h-full rounded-full bg-primary/60" style={{ width: `${pct}%` }} />
                        </div>
                        <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md ${color}`}>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Search + Filter bar */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-white/30" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    placeholder="Search by name, email, phone, or org..."
                    className="w-full h-12 pl-11 pr-4 rounded-xl bg-white dark:bg-white/5 border-2 border-gray-200 dark:border-white/10 text-gray-900 dark:text-white text-sm font-bold placeholder:text-gray-300 dark:placeholder:text-white/20 focus:outline-none focus:border-sky-400/60"
                  />
                </div>
                <select
                  value={userPlanFilter}
                  onChange={e => setUserPlanFilter(e.target.value)}
                  className="h-12 px-4 rounded-xl bg-white dark:bg-white/5 border-2 border-gray-200 dark:border-white/10 text-gray-900 dark:text-white text-xs font-black uppercase tracking-widest focus:outline-none focus:border-sky-400/60"
                >
                  <option value="all">All Plans</option>
                  {Object.entries(PLAN_LABELS).map(([k, { label }]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>
                {(userSearch || userPlanFilter !== 'all') && (
                  <button
                    onClick={() => { setUserSearch(''); setUserPlanFilter('all'); }}
                    className="h-12 px-4 rounded-xl border-2 border-gray-200 dark:border-white/10 text-gray-500 dark:text-white/40 hover:border-red-400 hover:text-red-500 font-black uppercase tracking-widest text-xs transition-colors flex items-center gap-2"
                  >
                    <X className="w-3.5 h-3.5" /> Clear
                  </button>
                )}
              </div>

              {/* Results count */}
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-white/30">
                Showing {filtered.length} of {allUsers.length} users
              </p>

              {/* Table */}
              {loadingUsers ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-20 text-gray-400 dark:text-white/30 font-bold uppercase tracking-widest text-sm">
                  No users match your search
                </div>
              ) : (
                <div className="rounded-2xl border border-gray-200 dark:border-white/10 overflow-hidden bg-white dark:bg-[#0a0a0a]">
                  {/* Table header */}
                  <div className="grid grid-cols-12 gap-0 bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-white/10 px-5 py-3">
                    <button onClick={() => toggleSort('fullName')} className="col-span-3 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 text-left">
                      Name / Email <SortIcon field="fullName" />
                    </button>
                    <div className="col-span-2 text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-white/30">Role</div>
                    <button onClick={() => toggleSort('plan_type')} className="col-span-2 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 text-left">
                      Plan <SortIcon field="plan_type" />
                    </button>
                    <button onClick={() => toggleSort('createdAt')} className="col-span-2 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 text-left">
                      Joined <SortIcon field="createdAt" />
                    </button>
                    <div className="col-span-2 text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-white/30">Cancelled</div>
                    <div className="col-span-1 text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-white/30">Beta</div>
                  </div>

                  {/* Table rows */}
                  <div className="divide-y divide-gray-100 dark:divide-white/5">
                    {filtered.map((u) => {
                      const isExpanded = expandedUserId === u.id;
                      const cancelDate = u.cancelledAt || u.subscription_cancelled_at || u.canceledAt;
                      return (
                        <div key={u.id}>
                          <button
                            onClick={() => setExpandedUserId(isExpanded ? null : u.id)}
                            className="w-full grid grid-cols-12 gap-0 px-5 py-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-left group"
                          >
                            {/* Name + Email */}
                            <div className="col-span-3 min-w-0">
                              <p className="text-sm font-black text-gray-900 dark:text-white truncate">
                                {u.fullName || u.name || <span className="text-gray-400 italic font-normal text-xs">No name</span>}
                              </p>
                              <p className="text-[10px] text-gray-400 dark:text-white/30 font-mono truncate">{u.email || '—'}</p>
                            </div>
                            {/* Role */}
                            <div className="col-span-2 flex items-center">
                              <span className="text-[9px] font-black uppercase tracking-widest bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-white/50 px-2 py-0.5 rounded-lg">
                                {u.role || 'user'}
                              </span>
                            </div>
                            {/* Plan */}
                            <div className="col-span-2 flex items-center">
                              {planBadge(u.plan_type)}
                            </div>
                            {/* Joined */}
                            <div className="col-span-2 flex items-center">
                              <span className="text-[10px] font-bold text-gray-500 dark:text-white/40">{fmt(u.createdAt)}</span>
                            </div>
                            {/* Cancelled */}
                            <div className="col-span-2 flex items-center">
                              {cancelDate
                                ? <span className="text-[10px] font-bold text-red-500">{fmt(cancelDate)}</span>
                                : <span className="text-[10px] font-bold text-gray-300 dark:text-white/20">—</span>
                              }
                            </div>
                            {/* Beta */}
                            <div className="col-span-1 flex items-center">
                              {u.isBetaTester
                                ? <span className="w-2 h-2 rounded-full bg-primary inline-block" title="Beta Tester" />
                                : <span className="w-2 h-2 rounded-full bg-gray-200 dark:bg-white/10 inline-block" />
                              }
                            </div>
                          </button>

                          {/* Expanded detail row */}
                          {isExpanded && (
                            <div className="bg-gray-50 dark:bg-white/3 border-t border-gray-100 dark:border-white/5 px-5 py-5 animate-in slide-in-from-top-1 duration-200">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {[
                                  { label: 'User ID', value: u.id },
                                  { label: 'Email', value: u.email },
                                  { label: 'Phone', value: u.phone || '—' },
                                  { label: 'Organization', value: u.organization || u.clubName || u.schoolName || '—' },
                                  { label: 'Plan Type', value: u.plan_type || 'free' },
                                  { label: 'Team Limit', value: u.team_limit ?? '—' },
                                  { label: 'Stripe Customer', value: u.stripe_customer_id || '—' },
                                  { label: 'Stripe Sub ID', value: u.stripe_subscription_id || '—' },
                                  { label: 'Joined', value: fmt(u.createdAt) },
                                  { label: 'Beta Upgraded', value: fmt(u.betaUpgradedAt) },
                                  { label: 'Cancelled', value: fmt(cancelDate) },
                                  { label: 'Is Demo', value: u.isDemo ? 'Yes' : 'No' },
                                ].map(({ label, value }) => (
                                  <div key={label} className="space-y-1">
                                    <p className="text-[8px] font-black uppercase tracking-widest text-gray-400 dark:text-white/25">{label}</p>
                                    <p className="text-xs font-bold text-gray-700 dark:text-white/70 font-mono break-all">{value}</p>
                                  </div>
                                ))}
                              </div>
                              <div className="flex gap-2 mt-4">
                                <button
                                  onClick={() => { setActiveTab('accounts'); setSearchTerm(u.email || ''); }}
                                  className="text-[9px] font-black uppercase tracking-widest text-sky-500 hover:text-sky-400 flex items-center gap-1 transition-colors"
                                >
                                  <ExternalLink className="w-3 h-3" /> Open in Account Lookup
                                </button>
                                <span className="text-gray-300 dark:text-white/20">·</span>
                                <button
                                  onClick={() => { navigator.clipboard.writeText(u.id); toast({ title: 'UID Copied' }); }}
                                  className="text-[9px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 dark:hover:text-white/60 flex items-center gap-1 transition-colors"
                                >
                                  <Copy className="w-3 h-3" /> Copy UID
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

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
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Beta Applications</h1>
                <p className="text-gray-400 dark:text-white/30 text-xs font-bold uppercase tracking-widest">Review beta tester requests</p>
              </div>
              <Button onClick={fetchBetaApps} variant="outline" className="border-gray-200 dark:border-white/10 text-gray-900 dark:text-white">
                <RefreshCw className="w-4 h-4 mr-2" /> Refresh
              </Button>
            </div>

            {/* ── NOTIFY BETA USERS ── */}
            <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/30 rounded-[2rem] p-8 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/20 flex items-center justify-center">
                  <Bell className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tight text-gray-900 dark:text-white">Notify Beta Users</h2>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-white/30">Broadcast a message to all beta testers</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-white/40">Notification Title</Label>
                  <Input
                    value={notifTitle}
                    onChange={e => setNotifTitle(e.target.value)}
                    placeholder="e.g. v1.2 Update — New Scheduling Features"
                    className="h-12 rounded-xl bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-900 dark:text-white font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-white/40">Message / Update Body</Label>
                  <Textarea
                    value={notifBody}
                    onChange={e => setNotifBody(e.target.value)}
                    placeholder="What's new? Describe the update or announcement for beta testers…"
                    className="min-h-[100px] rounded-xl bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-900 dark:text-white font-medium resize-y"
                  />
                </div>
                <Button
                  onClick={sendBetaNotification}
                  disabled={sendingNotif || !notifTitle.trim() || !notifBody.trim()}
                  className="h-12 rounded-xl bg-primary hover:bg-primary/90 font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20 flex items-center gap-2 w-full md:w-auto"
                >
                  {sendingNotif ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send to All Beta Users
                </Button>
              </div>
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
                            {(selectedBetaApp.features || []).length > 0 ? (selectedBetaApp.features || []).map((feat: string, i: number) => (
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

                      {/* Section 6: Mailing Address */}
                      <div className="space-y-6 pt-6 border-t border-gray-200 dark:border-white/10">
                        <div className="flex items-center gap-3">
                          <div className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-sm">6</div>
                          <h3 className="text-xl font-black uppercase tracking-tight text-gray-900 dark:text-white">Mailing Address</h3>
                        </div>
                        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-primary">📦 "The Squad" Gift Shipping Address</p>
                          <div className="space-y-2 text-sm font-bold text-gray-900 dark:text-white">
                            <p>{selectedBetaApp.address_street || <span className="text-gray-400 italic">No street provided</span>}</p>
                            <p>
                              {[selectedBetaApp.address_city, selectedBetaApp.address_state, selectedBetaApp.address_zip]
                                .filter(Boolean).join(', ') || <span className="text-gray-400 italic">No city/state/zip provided</span>}
                            </p>
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
                            {/* Divider: New Account path */}
                            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-white/30 ml-1">New Account</p>
                            <Button 
                              className="w-full h-14 bg-[#4ade80] hover:bg-[#22c55e] text-black font-black uppercase tracking-widest text-xs sm:text-sm rounded-xl shadow-xl shadow-emerald-500/20"
                              onClick={handleApproveBeta}
                              disabled={!betaPassword || processingBeta}
                            >
                              {processingBeta ? <Loader2 className="w-5 h-5 animate-spin" /> : '✦ Approve & Create New Account'}
                            </Button>
                            {/* Divider: Existing Account path */}
                            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-white/30 ml-1 mt-1">Already Has Account</p>
                            <Button 
                              className="w-full h-14 bg-amber-400 hover:bg-amber-500 text-black font-black uppercase tracking-widest text-xs sm:text-sm rounded-xl shadow-lg shadow-amber-400/20"
                              onClick={handleDirectApproveExisting}
                              disabled={processingBeta}
                            >
                              {processingBeta ? <Loader2 className="w-5 h-5 animate-spin" /> : '⚡ Approve — Upgrade Existing Account'}
                            </Button>
                            <Button 
                              variant="outline"
                              className="w-full h-14 border-2 border-red-500 text-red-500 hover:bg-red-500 hover:text-white font-black uppercase tracking-widest text-xs sm:text-sm rounded-xl transition-all mt-1"
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
                              {(selectedBetaApp.devices || []).length > 0 ? (selectedBetaApp.devices || []).map((device: string, i: number) => (
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
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  <span className="text-gray-500 dark:text-white/40">{bugReports.filter(b => b.fixed).length} Fixed</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block ml-2" />
                  <span className="text-gray-500 dark:text-white/40">{bugReports.filter(b => !b.fixed).length} Open</span>
                </div>
                <Button onClick={fetchBugs} variant="outline" className="border-gray-200 dark:border-white/10 text-gray-900 dark:text-white">
                  <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                </Button>
              </div>
            </div>
            
            {loadingBugs ? (
              <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>
            ) : bugReports.length === 0 ? (
              <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl p-12 text-center text-gray-500 dark:text-gray-900 dark:text-white/40">No bug reports found.</div>
            ) : (
              <div className="space-y-4">
                {/* Open bugs first */}
                {[...bugReports].sort((a, b) => (a.fixed === b.fixed ? 0 : a.fixed ? 1 : -1)).map(bug => (
                  <div
                    key={bug.id}
                    className={`border rounded-2xl p-6 flex flex-col md:flex-row gap-6 items-start transition-all ${
                      bug.fixed
                        ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-500/20 opacity-70'
                        : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10'
                    }`}
                  >
                    {/* Left metadata */}
                    <div className="w-full md:w-64 shrink-0 space-y-4">
                      {/* Fixed / Open badge */}
                      <div className="flex items-center gap-2">
                        {bug.fixed ? (
                          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                            <CheckCircle2 className="w-3 h-3" /> Fixed
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400 text-[10px] font-black uppercase tracking-widest">
                            <Bug className="w-3 h-3" /> Open
                          </span>
                        )}
                      </div>
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
                      {bug.fixed && bug.fixedAt && (
                        <p className="text-[10px] text-emerald-500 font-mono">Fixed: {new Date(bug.fixedAt).toLocaleString()}</p>
                      )}

                      {/* Mark as Fixed / Reopen */}
                      <button
                        onClick={() => markBugFixed(bug.id, !!bug.fixed)}
                        className={`flex items-center gap-2 w-full justify-center px-4 py-2.5 rounded-xl border-2 font-black uppercase text-[10px] tracking-widest transition-all hover:scale-105 ${
                          bug.fixed
                            ? 'border-orange-400 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10'
                            : 'border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                        }`}
                      >
                        {bug.fixed ? (
                          <><Bug className="w-3.5 h-3.5" /> Reopen Bug</>
                        ) : (
                          <><CheckCircle2 className="w-3.5 h-3.5" /> Mark as Fixed</>
                        )}
                      </button>
                    </div>

                    {/* Right content */}
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

        {/* ══════════ NEWSLETTERS TAB ══════════ */}
        {activeTab === 'newsletters' && (() => {
          const term = newsletterSearch.toLowerCase();
          const filtered = newsletters.filter(n =>
            (n.name || '').toLowerCase().includes(term) ||
            (n.email || '').toLowerCase().includes(term)
          );

          const exportCSV = () => {
            const rows = [['Name', 'Email', 'Source', 'Date'], ...filtered.map(n => [
              n.name || '',
              n.email || '',
              n.source || 'landing_page',
              n.createdAt?.toDate ? n.createdAt.toDate().toLocaleDateString() : '—',
            ])];
            const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `squad_newsletter_leads_${new Date().toISOString().slice(0,10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          };

          return (
            <div className="space-y-8">
              {/* Header */}
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h1 className="text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Newsletters</h1>
                  <p className="text-gray-400 dark:text-white/30 text-xs font-bold uppercase tracking-widest mt-1">
                    {loadingNewsletters ? 'Loading...' : `${newsletters.length} total signups`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={fetchNewsletters}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 font-black uppercase tracking-widest text-xs transition-colors"
                    disabled={loadingNewsletters}
                  >
                    {loadingNewsletters ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Refresh
                  </button>
                  <button
                    onClick={exportCSV}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-500 font-black uppercase tracking-widest text-xs transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Export CSV
                  </button>
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: 'Total Signups', value: newsletters.length, color: 'bg-emerald-500/10 text-emerald-500', border: 'border-emerald-500/20', icon: Mail },
                  { label: 'This Week', value: newsletters.filter(n => {
                    if (!n.createdAt?.toDate) return false;
                    const d = n.createdAt.toDate();
                    const now = new Date();
                    const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
                    return diff <= 7;
                  }).length, color: 'bg-sky-500/10 text-sky-500', border: 'border-sky-500/20', icon: TrendingUp },
                  { label: 'With Names', value: newsletters.filter(n => n.name?.trim()).length, color: 'bg-violet-500/10 text-violet-500', border: 'border-violet-500/20', icon: Users },
                ].map(card => (
                  <div key={card.label} className={`rounded-2xl border-2 ${card.border} bg-white dark:bg-white/5 p-5 space-y-3`}>
                    <div className={`w-9 h-9 rounded-xl ${card.color} flex items-center justify-center`}>
                      <card.icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-2xl font-black text-gray-900 dark:text-white">{card.value}</p>
                      <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-white/30 mt-0.5">{card.label}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-white/30" />
                <input
                  type="text"
                  placeholder="Search by name or email…"
                  value={newsletterSearch}
                  onChange={e => setNewsletterSearch(e.target.value)}
                  className="w-full h-12 pl-10 pr-4 rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-sm font-bold text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              {/* Table */}
              {loadingNewsletters ? (
                <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-gray-400 dark:text-white/30 font-bold uppercase tracking-widest text-xs">
                  {newsletters.length === 0 ? 'No newsletter signups yet.' : 'No results match your search.'}
                </div>
              ) : (
                <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-200 dark:border-white/10 overflow-hidden">
                  <div className="grid grid-cols-[1fr_2fr_1fr_auto] gap-0 text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-white/30 px-6 py-3 border-b border-gray-100 dark:border-white/10">
                    <span>Name</span><span>Email</span><span>Source</span><span>Date</span>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-white/10">
                    {filtered.map((lead, i) => (
                      <div key={lead.id || i} className="grid grid-cols-[1fr_2fr_1fr_auto] gap-0 px-6 py-4 items-center hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <span className="text-sm font-bold text-gray-900 dark:text-white truncate pr-3">{lead.name || <span className="text-gray-300 dark:text-white/20 italic">—</span>}</span>
                        <span className="text-sm text-gray-600 dark:text-white/60 font-mono truncate pr-3">{lead.email}</span>
                        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 w-fit">{lead.source || 'landing'}</span>
                        <span className="text-[10px] text-gray-400 dark:text-white/30 font-mono whitespace-nowrap pl-3">{lead.createdAt?.toDate ? lead.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}


        {/* ══════════ SPORTS HUB TAB ══════════ */}
        {activeTab === 'sports-hub' && (() => {
          const SH_SECTIONS = [
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'rss', label: 'RSS Feeds', icon: Rss },
            { id: 'subscribers', label: 'Subscribers', icon: Mail },
            { id: 'compose', label: 'Quick Compose', icon: PenLine },
          ] as const;

          const HUB_CATEGORIES = [
            'Coaching', 'Player Development', 'Team Management', 'Tournament Management',
            'League Management', 'Sports Technology', 'Sports Science', 'Nutrition',
            'Recovery', 'Volunteer Management', 'Parent Resources', 'Rule Changes',
            'Youth Sports', 'Mental Performance', 'Strength & Conditioning', 'Product Updates',
          ];

          const syncStatusColor: Record<string, string> = {
            success: 'text-emerald-500 bg-emerald-500/10',
            error: 'text-red-500 bg-red-500/10',
            pending: 'text-amber-500 bg-amber-500/10',
          };

          return (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Sports Hub</h1>
                    <p className="text-gray-400 dark:text-white/30 text-[9px] font-black uppercase tracking-widest mt-0.5">Content Management System</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={fetchSportsHubData}
                    disabled={loadingSH}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary font-black uppercase tracking-widest text-xs transition-colors"
                  >
                    {loadingSH ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Refresh
                  </button>
                  <a href="/sports-hub" target="_blank" rel="noopener noreferrer">
                    <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 font-black uppercase tracking-widest text-xs transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" /> View Hub
                    </button>
                  </a>
                </div>
              </div>

              {/* Sub-nav */}
              <div className="flex gap-2 flex-wrap">
                {SH_SECTIONS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setShSection(id as any)}
                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${
                      shSection === id ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/50 hover:bg-gray-200 dark:hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />{label}
                  </button>
                ))}
              </div>

              {/* ── Overview ── */}
              {shSection === 'overview' && (
                <div className="space-y-6">
                  {/* KPI Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: 'RSS Feeds', value: shFeeds.length, sub: `${shFeeds.filter(f => f.isEnabled).length} active`, icon: Rss, color: 'text-sky-500', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
                      { label: 'Articles', value: shArticles.length, sub: 'Published', icon: FileText, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' },
                      { label: 'Subscribers', value: shNewsletters.length, sub: 'Hub newsletter', icon: Mail, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
                      { label: 'Last Sync', value: shFeeds.filter(f => f.lastSyncStatus === 'success').length, sub: 'feeds OK', icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/20' },
                    ].map(card => (
                      <div key={card.label} className={`rounded-2xl border-2 ${card.border} bg-white dark:bg-white/5 p-5 space-y-3`}>
                        <div className={`w-9 h-9 rounded-xl ${card.bg} flex items-center justify-center`}>
                          <card.icon className={`w-4 h-4 ${card.color}`} />
                        </div>
                        <div>
                          <p className={`text-2xl font-black ${card.color}`}>{loadingSH ? '—' : card.value}</p>
                          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-white/30 mt-0.5">{card.label}</p>
                          <p className="text-[8px] text-gray-400 dark:text-white/20 font-bold uppercase tracking-wider">{card.sub}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Content Policy Notice */}
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5 flex gap-4">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-1">Content Policy Enforced Automatically</p>
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-300/70 leading-relaxed">
                        RSS imports are filtered for: betting, fantasy sports, gambling, politics, celebrity news, transfer rumors, clickbait, and AI spam. Articles older than 30 days are automatically rejected. RSS content never exceeds 50% of any section.
                      </p>
                    </div>
                  </div>

                  {/* Recent Articles */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-gray-400 dark:text-white/30">Recent Articles</p>
                      <button onClick={() => setShSection('compose')} className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-primary hover:opacity-70 transition-opacity">
                        <PenLine className="w-3 h-3" />New Article
                      </button>
                    </div>
                    {loadingSH ? (
                      <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : shArticles.length === 0 ? (
                      <div className="text-center py-10 text-gray-400 dark:text-white/30 font-bold uppercase tracking-widest text-xs">
                        No articles published yet. Use Quick Compose to get started.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {shArticles.map(article => (
                          <div key={article.id} className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-xl px-5 py-4 flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap gap-2 mb-1">
                                {(article.categories || []).slice(0, 1).map((cat: string) => (
                                  <span key={cat} className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/10 text-primary">{cat}</span>
                                ))}
                                <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-white/40">{article.section || 'hub'}</span>
                              </div>
                              <p className="text-sm font-black text-gray-900 dark:text-white truncate">{article.title}</p>
                              <p className="text-[10px] text-gray-400 dark:text-white/30 font-mono mt-0.5">{article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : '—'} · {article.readingTime || '?'} min read</p>
                            </div>
                            <a href={`/sports-hub/articles/${article.slug}`} target="_blank" rel="noopener noreferrer">
                              <button className="text-gray-400 hover:text-primary transition-colors p-1.5 rounded-lg hover:bg-primary/5">
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── RSS Feeds Manager ── */}
              {shSection === 'rss' && (
                <div className="space-y-6">
                  {/* Add Feed Form */}
                  <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl p-6 space-y-4">
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-gray-400 dark:text-white/30">Add New RSS Feed</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-1">
                        <Label className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1 block">Feed Name</Label>
                        <Input
                          placeholder="e.g. Sports Science Weekly"
                          value={shFeedName}
                          onChange={e => setShFeedName(e.target.value)}
                          className="h-10 rounded-xl bg-gray-50 dark:bg-white/5 font-medium"
                        />
                      </div>
                      <div className="md:col-span-1">
                        <Label className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1 block">Feed URL</Label>
                        <Input
                          placeholder="https://example.com/rss"
                          value={shFeedUrl}
                          onChange={e => setShFeedUrl(e.target.value)}
                          className="h-10 rounded-xl bg-gray-50 dark:bg-white/5 font-medium"
                        />
                      </div>
                      <div>
                        <Label className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1 block">Category</Label>
                        <select
                          value={shFeedCategory}
                          onChange={e => setShFeedCategory(e.target.value)}
                          className="w-full h-10 px-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-sm font-bold"
                        >
                          {HUB_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2 flex items-center gap-2 text-[10px] font-bold text-amber-600 dark:text-amber-400 flex-1">
                        <Globe className="w-3.5 h-3.5 shrink-0" />
                        Content filter runs automatically on import. Betting, politics, fantasy sports, and clickbait are rejected.
                      </div>
                      <button
                        onClick={addRSSFeed}
                        disabled={addingFeed || !shFeedUrl.trim() || !shFeedName.trim()}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white font-black uppercase tracking-widest text-xs transition-all hover:bg-primary/90 disabled:opacity-50 shrink-0"
                      >
                        {addingFeed ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rss className="w-3.5 h-3.5" />}
                        Add Feed
                      </button>
                    </div>
                  </div>

                  {/* Feeds Table */}
                  {loadingSH ? (
                    <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                  ) : shFeeds.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 dark:text-white/30 font-bold uppercase tracking-widest text-xs">
                      No RSS feeds configured yet. Add one above.
                    </div>
                  ) : (
                    <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-200 dark:border-white/10 overflow-hidden">
                      <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-0 text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-white/30 px-6 py-3 border-b border-gray-100 dark:border-white/10">
                        <span>Feed</span><span>Category</span><span>Status</span><span>Actions</span>
                      </div>
                      <div className="divide-y divide-gray-100 dark:divide-white/10">
                        {shFeeds.map(feed => (
                          <div key={feed.id} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-0 px-6 py-4 items-center hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                            <div className="min-w-0 pr-4">
                              <p className="text-sm font-black text-gray-900 dark:text-white truncate">{feed.name}</p>
                              <p className="text-[10px] text-gray-400 dark:text-white/30 font-mono truncate">{feed.url}</p>
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-sky-100 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 w-fit">
                              {feed.category || 'General'}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full w-fit ${syncStatusColor[feed.lastSyncStatus || 'pending']}`}>
                                {feed.lastSyncStatus || 'pending'}
                              </span>
                              <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${feed.isEnabled ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-gray-100 dark:bg-white/10 text-gray-400 dark:text-white/30'}`}>
                                {feed.isEnabled ? 'On' : 'Off'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 pl-4">
                              <button
                                onClick={() => triggerRSSRefresh(feed.id, feed.url)}
                                disabled={refreshingFeed === feed.id}
                                title="Refresh now"
                                className="p-2 rounded-lg hover:bg-sky-500/10 text-sky-500 transition-colors"
                              >
                                {refreshingFeed === feed.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={() => toggleFeedEnabled(feed.id, feed.isEnabled)}
                                title={feed.isEnabled ? 'Disable feed' : 'Enable feed'}
                                className={`p-2 rounded-lg transition-colors ${feed.isEnabled ? 'hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400' : 'hover:bg-emerald-500/10 text-emerald-500'}`}
                              >
                                {feed.isEnabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={() => deleteFeed(feed.id)}
                                title="Remove feed"
                                className="p-2 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Subscribers ── */}
              {shSection === 'subscribers' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {[
                      { label: 'Total Subscribers', value: shNewsletters.length, icon: Mail, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
                      { label: 'This Month', value: shNewsletters.filter(n => { if (!n.subscribedAt) return false; return new Date(n.subscribedAt) > new Date(Date.now() - 30 * 86400000); }).length, icon: TrendingUp, color: 'text-sky-500', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
                      { label: 'Active', value: shNewsletters.filter(n => n.isActive !== false).length, icon: CheckCircle, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' },
                    ].map(card => (
                      <div key={card.label} className={`rounded-2xl border-2 ${card.border} bg-white dark:bg-white/5 p-5 space-y-3`}>
                        <div className={`w-9 h-9 rounded-xl ${card.bg} flex items-center justify-center`}>
                          <card.icon className={`w-4 h-4 ${card.color}`} />
                        </div>
                        <div>
                          <p className={`text-2xl font-black ${card.color}`}>{card.value}</p>
                          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-white/30 mt-0.5">{card.label}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {loadingSH ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                  ) : shNewsletters.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 dark:text-white/30 font-bold uppercase tracking-widest text-xs">
                      No Hub newsletter subscribers yet.
                    </div>
                  ) : (
                    <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-200 dark:border-white/10 overflow-hidden">
                      <div className="grid grid-cols-[2fr_2fr_1fr_auto] gap-0 text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-white/30 px-6 py-3 border-b border-gray-100 dark:border-white/10">
                        <span>Email</span><span>Sports</span><span>Status</span><span>Date</span>
                      </div>
                      <div className="divide-y divide-gray-100 dark:divide-white/10">
                        {shNewsletters.slice(0, 100).map((sub, i) => (
                          <div key={sub.id || i} className="grid grid-cols-[2fr_2fr_1fr_auto] gap-0 px-6 py-3 items-center hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                            <span className="text-sm text-gray-700 dark:text-white/70 font-mono truncate pr-4">{sub.email}</span>
                            <span className="text-[10px] text-gray-400 dark:text-white/30 font-medium truncate pr-4">{(sub.sports || []).join(', ') || '—'}</span>
                            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full w-fit ${sub.isActive !== false ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-gray-100 text-gray-400'}`}>
                              {sub.isActive !== false ? 'Active' : 'Inactive'}
                            </span>
                            <span className="text-[10px] text-gray-400 dark:text-white/30 font-mono whitespace-nowrap pl-4">
                              {sub.subscribedAt ? new Date(sub.subscribedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Quick Compose ── */}
              {shSection === 'compose' && (
                <div className="space-y-5 max-w-2xl">
                  <div className="bg-sky-500/10 border border-sky-500/20 rounded-2xl p-4 flex gap-3 text-xs font-medium text-sky-700 dark:text-sky-300">
                    <Star className="w-4 h-4 shrink-0 mt-0.5 text-sky-500" />
                    Quick Compose creates a published article stub in Firestore. For full rich-text editing, open the article in the Sports Hub CMS and use the article editor.
                  </div>
                  <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl p-6 space-y-5">
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-gray-400 dark:text-white/30">New Sports Hub Article</p>
                    <div>
                      <Label className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1.5 block">Title</Label>
                      <Input
                        placeholder="Building Championship Culture: Leadership Strategies…"
                        value={shComposeTitle}
                        onChange={e => setShComposeTitle(e.target.value)}
                        className="h-12 rounded-xl bg-gray-50 dark:bg-white/5 font-bold text-base"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1.5 block">Section</Label>
                        <select
                          value={shComposeSection}
                          onChange={e => setShComposeSection(e.target.value)}
                          className="w-full h-10 px-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-sm font-bold"
                        >
                          {['news', 'coaching', 'team-management', 'tournaments', 'resources', 'featured'].map(s => (
                            <option key={s} value={s}>{s.replace('-', ' ')}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1.5 block">Category</Label>
                        <select
                          value={shComposeCategory}
                          onChange={e => setShComposeCategory(e.target.value)}
                          className="w-full h-10 px-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-sm font-bold"
                        >
                          {HUB_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <Label className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1.5 block">Excerpt / Intro Paragraph</Label>
                      <Textarea
                        placeholder="Discover the proven leadership frameworks that elite coaches use to build cultures of excellence, accountability, and sustained performance…"
                        value={shComposeExcerpt}
                        onChange={e => setShComposeExcerpt(e.target.value)}
                        rows={5}
                        className="rounded-xl bg-gray-50 dark:bg-white/5 font-medium resize-none"
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={publishHubArticle}
                        disabled={publishingArticle || !shComposeTitle.trim() || !shComposeExcerpt.trim()}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-black uppercase tracking-widest text-xs transition-all hover:bg-primary/90 disabled:opacity-50"
                      >
                        {publishingArticle ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}
                        Publish Article
                      </button>
                      <button
                        onClick={() => { setShComposeTitle(''); setShComposeExcerpt(''); }}
                        className="text-xs font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

      </div>
    </div>
  );
}
