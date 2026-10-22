"use client";
import { isTeamModuleRouteDisabled } from '@/lib/team-module-visibility';
import { useTeam } from '@/components/providers/team-provider';
import { Radio, CalendarDays, Users, Dumbbell, Medal, Trophy, HandHelping, PiggyBank, MessageCircle, FolderClosed, PenTool, MapPin, Package } from 'lucide-react';
import { authorizeDashboardRoute } from '@/lib/dashboard-route-policy';
import { hasCoachesCornerEntitlement } from '@/lib/coaches-corner-entitlement';
const coordinationTabs = [
  { name: 'Feed', href: '/feed', icon: Radio, pro: true },
  { name: 'Schedule', href: '/events', icon: CalendarDays, pro: false },
  { name: 'Roster', href: '/roster', icon: Users, pro: false },
  { name: 'Practice', href: '/practice', icon: Dumbbell, pro: true },
  { name: 'Competition Hub', href: '/competition', icon: Medal, pro: false },
  { name: 'Leagues', href: '/leagues', icon: Medal, pro: false },
  { name: 'Tournaments', href: '/manage-tournaments', icon: Trophy, pro: false },
  { name: 'Scorekeeping', href: '/games', icon: Trophy, pro: false },
  { name: 'Volunteer', href: '/volunteers', icon: HandHelping, pro: true },
  { name: 'Fundraising', href: '/fundraising', icon: PiggyBank, pro: true },
  { name: 'Team Chat', href: '/chats', icon: MessageCircle, pro: false },
  { name: 'Library', href: '/files', icon: FolderClosed, pro: false },
];

export const adminTabs = [
  { name: 'Coach Tools', href: '/coaches-corner', icon: PenTool, pro: true, desc: 'Waivers and documents' },
  { name: 'Facilities', href: '/facilities', icon: MapPin, pro: false, desc: 'Venues and fields' },
  { name: 'Equipment', href: '/equipment', icon: Package, pro: true, desc: 'Team inventory' },
];


export function useTeamNavigation() {
  const { activeTeam, user, isParent, isPlayer, isStaff, isSuperAdmin, isSchoolMode, isPrimaryClubAuthority, hasFeature, isPro } = useTeam();
  const canManageFacilities = isSuperAdmin || !activeTeam || activeTeam.ownerUserId === user?.id;
  const canAccessCoachesCorner = hasCoachesCornerEntitlement(activeTeam, isSuperAdmin);
  const isAdminTabLocked = (tab: {href: string; pro: boolean}) => tab.href === '/coaches-corner' ? !canAccessCoachesCorner : tab.pro && !isPro;
  const roleNavigationOrder = isParent
    ? ['/events', '/chats', '/files', '/volunteers', '/competition']
    : isPlayer
      ? ['/events', '/chats', '/practice', '/roster']
      : user?.role === 'league_creator'
        ? ['/competition', '/events', '/games', '/roster', '/chats']
        : ['/events', '/roster', '/chats', '/practice', '/games'];

  const navigationPriority = (href: string) => {
    const index = roleNavigationOrder.indexOf(href);
    return index === -1 ? roleNavigationOrder.length : index;
  };

  const filteredCoordTabs = coordinationTabs
    .filter(tab => {
      // League creators without a team: only show Competition Hub so they can manage leagues
      if (user?.role === 'league_creator' && !activeTeam) {
        return tab.name === 'Competition Hub';
      }

      if (!authorizeDashboardRoute(tab.href, {
        role: user?.role,
        plan_type: user?.plan_type,
        isPrimaryClubAuthority,
      }, isSuperAdmin ? 'superadmin' : undefined).allowed) return false;

      if (isTeamModuleRouteDisabled(tab.href, activeTeam?.features)) return false;

      // Feed is filtered by plan/feature
      if (tab.name === 'Feed') return hasFeature?.('live_feed_read') && !(isParent && activeTeam?.parentFeedEnabled === false);
      // Roster: hide for school admins in institution mode (they use the School Hub instead)
      if (tab.name === 'Roster' && isSchoolMode && isPrimaryClubAuthority && activeTeam?.type === 'school') return false;
      // Fundraising: staff-only administrative module — players and parents cannot access it
      if (tab.name === 'Fundraising' && !isStaff) return false;
      return true;
    })
    .map(tab => {
      if (tab.href === '/competition' && isSchoolMode) {
        return { ...tab, name: 'Program League Hub' };
      }
      return tab;
    })
    .sort((a, b) => navigationPriority(a.href) - navigationPriority(b.href));



  const filteredAdminTabs = adminTabs.filter(tab => {
    // League creators without a team: show Facilities (free) + Equipment (locked if free)
    if (user?.role === 'league_creator' && !activeTeam) {
      return tab.name === 'Facilities' || tab.name === 'Equipment';
    }
    if (tab.name === 'Facilities' && !canManageFacilities) return false;
    if (isTeamModuleRouteDisabled(tab.href, activeTeam?.features)) return false;
    return true;
  });

  return { filteredCoordTabs, filteredAdminTabs, isAdminTabLocked };
}
