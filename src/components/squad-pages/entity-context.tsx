'use client';
import { createContext, useContext, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Globe2 } from 'lucide-react';
import { useTeam } from '@/components/providers/team-provider';
import { type EntityRef, entityKey } from '@/lib/squad-pages/model';
const Context = createContext<{ entity: EntityRef | null; set: Dispatch<SetStateAction<EntityRef | null>> }>({ entity: null, set: () => {} });
export function PageEntityProvider({ children }: { children: React.ReactNode }) {
  const { activeTeam, firebaseUser, teams, isSchoolMode } = useTeam(), pathname = usePathname(); const [selected, set] = useState<EntityRef | null>(null);
  useEffect(() => { set(null); }, [activeTeam?.id, firebaseUser?.uid]);
  useEffect(() => { if (!['/leagues', '/manage-tournaments', '/competition', '/dashboard/public-page'].includes(pathname)) set(null); }, [pathname]);
  const institution = !activeTeam && isSchoolMode ? teams.find(t => ['school', 'school_hub'].includes(t.type || '')) : null;
  const fallback: EntityRef | null = institution ? { kind: 'school', id: institution.id } : activeTeam ? { kind: ['school', 'school_hub'].includes(activeTeam.type || '') ? 'school' : activeTeam.schoolId ? 'program' : 'team', id: activeTeam.id } : firebaseUser ? { kind: 'club', id: firebaseUser.uid } : null;
  return <Context.Provider value={{ entity: selected || fallback, set }}>{children}</Context.Provider>;
}
export function PageEntityScope({ entity }: { entity: EntityRef }) {
  const { set } = useContext(Context); const serialized = JSON.stringify(entity);
  useEffect(() => { if (process.env.NEXT_PUBLIC_SQUAD_PAGES_ENABLED !== 'true') return; const ref = JSON.parse(serialized) as EntityRef; set(ref); return () => { if (window.location.pathname !== '/dashboard/public-page') set(current => current && entityKey(current) === entityKey(ref) ? null : current); }; }, [serialized, set]);
  return null;
}
export function PublicPageEntry({ entity, className = '', onNavigate }: { entity?: EntityRef; className?: string; onNavigate?: () => void }) {
  const context = useContext(Context), selected = entity || context.entity;
  if (process.env.NEXT_PUBLIC_SQUAD_PAGES_ENABLED !== 'true' || !selected) return null;
  return <Link onClick={onNavigate} href={`/dashboard/public-page?entity=${encodeURIComponent(entityKey(selected))}`} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${className}`}><Globe2 className="h-4 w-4" />Public Page<span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px]">Pro</span></Link>;
}

export const usePageEntity = () => useContext(Context);
export function confirmPageContextSwitch() { return process.env.NEXT_PUBLIC_SQUAD_PAGES_ENABLED !== 'true' || window.dispatchEvent(new Event('squad-pages-before-context-change', { cancelable: true })); }
