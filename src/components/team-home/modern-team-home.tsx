'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, UserCircle, ArrowRight, ChevronRight, MapPin, CircleAlert, CreditCard, FileCheck, CircleHelp, Users, Lock, Trophy, ClipboardList, Pencil, Medal, Clock3 } from 'lucide-react';
import { useTeam } from '@/components/providers/team-provider';
import { usePendingWaivers } from '@/hooks/use-pending-waivers';
import { useTeamNavigation } from './use-team-navigation';
import { CoverEditor } from './cover-editor';
import { TeamCover } from './team-cover';
import { authorizeDashboardRoute } from '@/lib/dashboard-route-policy';
import { nextTeamEvent, homeEventDateLabel, expandTournamentMatches, homeWinRate } from '@/lib/team-home-events';
import { AlertsHistoryDialog } from '@/components/layout/AlertOverlay';
import { Button } from '@/components/ui/button';

export function ModernTeamHome() {
  const router = useRouter();
  const { user, activeTeam, activeTeamEvents, homeDataStatus, isStaff, isParent, isSchoolMode, isYouth, isPrimaryClubAuthority, isEliteClubMode, isSuperAdmin, householdBalance, myChildren, updateRSVP, alerts, seenAlertIds, isPro, purchasePro, games } = useTeam();
  const { pendingDocs, error: waiverError, isLoading: waiversLoading } = usePendingWaivers();
  const { filteredCoordTabs, filteredAdminTabs, isAdminTabLocked } = useTeamNavigation();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(timer); }, []);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [pending, setPending] = useState('');
  const [message, setMessage] = useState('');
  if (!activeTeam || !user) return null;
  const canRoute = (path: string) => authorizeDashboardRoute(path, { ...user, isPrimaryClubAuthority }, isSuperAdmin ? 'superadmin' : undefined).allowed;
  const tournamentMatches = expandTournamentMatches(activeTeamEvents, activeTeam);
  const expandedParentIds = new Set(tournamentMatches.map(match => match.parentTournamentId));
  const event = nextTeamEvent([...activeTeamEvents.filter(item => !expandedParentIds.has(item.id)), ...tournamentMatches], activeTeam.id, now);
  const eventHref = event ? `/calendar?event=${encodeURIComponent(event.id)}&team=${encodeURIComponent(activeTeam.id)}` : '/calendar';
  const participants = [
    ...(!isParent || isStaff ? [{ id: user.id, name: 'You' }] : []),
    ...(isParent ? myChildren.filter(child => child.joinedTeamIds?.includes(activeTeam.id)).map(child => ({ id: child.id, name: `${child.firstName} ${child.lastName}`.trim() })) : []),
  ];
  const needsResponse = event && participants.some(person => !event.userRsvps?.[person.id] || event.userRsvps[person.id] === 'no_response');
  const unread = alerts.filter(alert => !seenAlertIds.includes(alert.id)).length;
  const hasAttention = Boolean(needsResponse || pendingDocs.length > 0 || (isParent && canRoute('/family/payments') && householdBalance > 0));
  const announcementsAction = homeDataStatus.alertsError ? <p role="alert" className="text-sm">Announcements could not load. <button className="underline" onClick={() => window.location.reload()}>Retry</button></p> : <AlertsHistoryDialog><Button variant="ghost" className="modern-announcements">View announcements {homeDataStatus.alertsLoading ? '· Loading…' : unread ? `· ${unread} unread` : ''}<ArrowRight className="ml-3 h-4 w-4"/></Button></AlertsHistoryDialog>;
  const essentialOrder = ['/events', '/roster', '/chats', '/practice', '/games', '/leagues', '/manage-tournaments', '/competition', '/feed'];
  const essentials = [...filteredCoordTabs.filter(tab => !['/files','/volunteers','/fundraising'].includes(tab.href))].sort((a,b) => essentialOrder.indexOf(a.href) - essentialOrder.indexOf(b.href));
  const resources = [...filteredCoordTabs.filter(tab => ['/files','/volunteers','/fundraising'].includes(tab.href)), ...(isStaff ? filteredAdminTabs.filter(tab => tab.href !== '/coaches-corner') : [])];
  async function respond(personId: string, status: string) {
    if (!event || !activeTeam || pending) return;
    setPending(personId); setMessage('');
    try { await updateRSVP('parentTournamentId' in event ? String(event.parentTournamentId) : event.id, status, activeTeam.id, personId); setMessage('Availability saved.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Availability could not be saved. Please try again.'); }
    finally { setPending(''); }
  }
  function tool(tab: {name: string; href: string; icon: typeof CalendarDays; pro: boolean}, management = false) {
    if (!canRoute(tab.href)) return null;
    const locked = management ? isAdminTabLocked(tab) : tab.pro && !isPro;
    const displayName = tab.name === 'Feed' ? 'Team Feed' : tab.name === 'Competition Hub' ? 'Competition Hub' : tab.name;
    const descriptions: Record<string, string> = { '/events': 'Games & practices', '/roster': 'Your team', '/chats': 'Stay connected', '/practice': 'Plans & drills' };
    const ToolIcon = tab.href === '/practice' ? ClipboardList : tab.href === '/games' ? Pencil : tab.href === '/leagues' ? Medal : tab.icon;
    const content = <><ToolIcon className="h-8 w-8 shrink-0 text-[#0b2043] dark:text-slate-200" strokeWidth={1.7}/><span className="modern-tool-copy"><span>{displayName}</span>{descriptions[tab.href] && <small>{descriptions[tab.href]}</small>}</span>{locked ? <Lock aria-label="Upgrade required" className="h-4 w-4 shrink-0"/> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground"/>}</>;
    const classes = 'modern-tool-card';
    return locked ? <button key={tab.href} className={classes} onClick={() => purchasePro()}>{content}</button> : <Link key={tab.href} href={tab.href} className={classes}>{content}</Link>;
  }
  return <div className="modern-team-home">
    <div className="modern-home-top modern-enter">
      <section className="modern-hero">
        <TeamCover key={activeTeam.homeCover?.id || 'default'} team={activeTeam}/>
        <div className="modern-hero-content">
          {activeTeam.teamLogoUrl && <img src={activeTeam.teamLogoUrl} alt="" className="modern-team-logo" onError={e => { e.currentTarget.style.display = 'none'; }}/>}
          <span className="modern-eyebrow">Team home</span>
          <h1>Built for<br/>game day.</h1>
          <p className="modern-hero-team-name">{activeTeam.name}</p>
          {(isStaff || isSuperAdmin) && <CoverEditor key={activeTeam.id} dashboard />}
        </div>
      </section>
      <div className="modern-top-aside">
        <Link href="/settings" className="modern-account-card">
          <UserCircle className="h-14 w-14 shrink-0" strokeWidth={1.3}/><div className="flex-1"><h2 className="text-2xl font-bold">My Account</h2><p className="mt-1 text-sm text-slate-300">Profile, family & preferences</p></div><ArrowRight className="h-6 w-6 shrink-0"/>
        </Link>
        <section aria-label="Next Up" className="modern-next-card">
          <div className="flex items-start gap-3"><CalendarDays className="h-10 w-10 shrink-0 rounded-lg bg-red-50 p-2 text-red-700"/><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-400">Next Up</p>
            {homeDataStatus.eventsLoading ? <p role="status">Loading events…</p> : homeDataStatus.eventsError ? <p role="alert">Events could not load. <button onClick={() => window.location.reload()} className="underline">Retry</button></p> : event ? <><Link href={eventHref} className="mt-1 block break-words text-xl font-bold hover:underline">{event.title}</Link><p className="modern-event-line"><Clock3 aria-hidden="true"/>{homeEventDateLabel(event)}</p><p className="modern-event-line"><MapPin className="h-4 w-4 shrink-0"/>{event.location || 'Location TBD'}</p>{event.status && <p className="text-xs font-semibold">{event.status}</p>}</> : <p className="mt-2 text-sm text-muted-foreground">No upcoming events scheduled.</p>}
          </div></div>
          {event && !homeDataStatus.eventsLoading && !homeDataStatus.eventsError && participants.length > 0 && <>
            <button className="modern-availability-button" aria-expanded={availabilityOpen} aria-controls="modern-availability" onClick={() => setAvailabilityOpen(open => !open)}>{needsResponse ? 'Set availability' : 'Update availability'}<ArrowRight className="h-4 w-4"/></button>
            {availabilityOpen && <div id="modern-availability" className="modern-availability-panel">
              {participants.map(person => <div key={person.id} className="modern-person-response"><p>{person.name === 'You' ? 'Your availability' : `${person.name} — availability`}{'parentTournamentId' in event ? ' (tournament)' : ''}</p><div className="flex flex-wrap gap-2">{[['going','Going'],['maybe','Maybe'],['declined',"Can't go"]].map(([status,label]) => <button key={status} disabled={!!pending} aria-pressed={event.userRsvps?.[person.id] === status} onClick={() => respond(person.id,status)} className="modern-rsvp-option">{label}</button>)}</div><small>Saved: {event.userRsvps?.[person.id] || 'No response'}</small></div>)}
            </div>}
          </>}
          {message && <p role="status" className="mt-2 text-sm">{message}</p>}
          <Link href={event ? eventHref : '/calendar'} className={event && participants.length ? "modern-event-details" : "modern-availability-button"}>{event ? 'Event details' : 'Open schedule'}<ArrowRight className="h-4 w-4"/></Link>
          {event && <Link href="/calendar" className="modern-full-schedule">Full schedule</Link>}
        </section>
      </div>
    </div>
    {waiverError && <p role="alert" className="rounded-xl border p-4">Document tasks could not load. <button className="underline" onClick={() => window.location.reload()}>Retry</button></p>}
    {waiversLoading && <p role="status" className="text-sm text-muted-foreground">Checking document tasks…</p>}
    {hasAttention && <section aria-label="Needs your attention" className="modern-attention modern-enter"><CircleAlert className="h-6 w-6"/><h2 className="font-bold">Your team needs you.</h2>{needsResponse && <Link className="text-sm underline" href={eventHref}>Confirm availability</Link>}{pendingDocs.length > 0 && <Link className="text-sm underline" href="/files">{pendingDocs.length} unsigned documents</Link>}{isParent && canRoute('/family/payments') && householdBalance > 0 && <Link className="text-sm underline" href="/family/payments">Review household balance</Link>}{announcementsAction}</section>}
    {!hasAttention && announcementsAction}
    <section className="modern-tool-section modern-enter"><div className="modern-section-heading"><h2>Team essentials</h2><p>Everything in one place.</p></div><div className="modern-tool-grid">{essentials.map(tab => tool(tab))}{isParent && tool({ name: 'Family Hub', href: '/family', icon: Users, pro: false })}</div></section>
    <section className="modern-tool-section modern-enter"><h2>Around the team</h2><div className="modern-tool-grid">{resources.map(tab => tool(tab, ['/facilities','/equipment'].includes(tab.href)))}{tool({ name: 'Payments', href: '/payments', icon: CreditCard, pro: false })}{tool({ name: 'Forms & Waivers', href: '/files', icon: FileCheck, pro: false })}{tool({ name: 'Help & Support', href: '/how-to', icon: CircleHelp, pro: false })}</div></section>
    <details aria-label="All team tools" className="modern-all-tools"><summary>All team tools <ChevronRight className="h-4 w-4"/></summary><div className="flex flex-wrap gap-3 text-sm">{!isYouth && <Link className="modern-secondary-link" href="/teams/join">Join with code</Link>}{!isYouth && canRoute('/teams/new') && <Link className="modern-secondary-link" href="/teams/new">New team</Link>}<Link className="rounded-xl border px-4 py-3" href="/sports-hub">Sports Hub</Link><Link className="rounded-xl border px-4 py-3" href="/calendar">Calendar subscriptions</Link>{isStaff && canRoute('/coaches-corner/attendance') && <Link className="rounded-xl border px-4 py-3" href="/coaches-corner/attendance">Attendance & check-in</Link>}{isStaff && <Link className="rounded-xl border px-4 py-3" href="/teams/join">Invitations & registration codes</Link>}{!Object.keys(activeTeam.leagueIds || {}).length && <Link className="rounded-xl border px-4 py-3" href="/teams/join">Join a league</Link>}<Link className="rounded-xl border px-4 py-3" href="/settings#appearance">Home screen layout</Link><span className="flex items-center gap-2 rounded-xl border px-4 py-3"><Trophy className="h-4 w-4"/>Win rate: {homeWinRate(games)}%</span>{isParent && canRoute('/family/payments') && <Link className="rounded-xl border px-4 py-3" href="/family/payments">Household: ${householdBalance.toLocaleString()}</Link>}</div></details>
    {isStaff && <section className="modern-management modern-enter"><div className="mr-auto"><p className="modern-management-label">Coach & Admin</p><h2 className="text-3xl font-black">Make the next play.</h2></div>{filteredAdminTabs.filter(tab => tab.href === '/coaches-corner' && canRoute(tab.href)).map(tab => <button key={tab.href} onClick={() => { if (isAdminTabLocked(tab)) purchasePro(); else router.push(tab.href); }} className="modern-management-link">Coach Tools {isAdminTabLocked(tab) ? '· Upgrade' : '↗'}</button>)}<Link href="/team" className="modern-management-link">Team Settings ↗</Link>{((isSchoolMode && isPrimaryClubAuthority) || isEliteClubMode || isSuperAdmin) && <Link href="/club" className="modern-management-link">{isSchoolMode ? 'School Hub' : 'Club Hub'} ↗</Link>}</section>}
    <footer className="modern-home-footer"><Link href="/dashboard" aria-label="The Squad team home"><img src="/logo-dark.png" alt="The Squad"/></Link><span>{activeTeam.name}</span><nav aria-label="Legal"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav></footer>
  </div>;
}
