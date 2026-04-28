"use client";

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { Shield, Table as TableIcon, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTeam } from '@/components/providers/team-provider';

// Dynamically import each hub's content component — keeps their internal state isolated and avoids SSR issues
const LeaguesHub = dynamic(
  () => import('../leagues/page').then(m => ({ default: m.LeaguesPageContent })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    ),
  }
);

const TournamentsHub = dynamic(
  () => import('../manage-tournaments/page').then(m => ({ default: m.ManageTournamentsPageContent })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    ),
  }
);

export default function CompetitionHubPage() {
  const { isSchoolMode } = useTeam();
  const pageTitle = isSchoolMode ? 'Program League Hub' : 'Competition Hub';

  return (
    <div className="space-y-8 pb-32">
      {/* Header */}
      <div className="space-y-1">
        <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3">
          {pageTitle}
        </Badge>
        <h1 className="text-4xl font-black uppercase tracking-tight">{pageTitle}</h1>
      </div>

      {/* Tab switcher */}
      <Tabs defaultValue="leagues" className="w-full">
        <TabsList className="flex bg-muted/50 p-1.5 rounded-[1.5rem] border shadow-inner h-14 gap-1 w-fit mb-2">
          <TabsTrigger
            value="leagues"
            className="rounded-xl font-black uppercase text-[10px] tracking-tight data-[state=active]:bg-white data-[state=active]:shadow-md px-6 flex items-center gap-2"
          >
            <Shield className="h-4 w-4" />
            {isSchoolMode ? 'Programs / Leagues' : 'Leagues'}
          </TabsTrigger>
          <TabsTrigger
            value="tournaments"
            className="rounded-xl font-black uppercase text-[10px] tracking-tight data-[state=active]:bg-white data-[state=active]:shadow-md px-6 flex items-center gap-2"
          >
            <TableIcon className="h-4 w-4" />
            Tournaments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="leagues" className="mt-0 animate-in fade-in duration-300">
          <Suspense fallback={<div className="flex items-center justify-center py-32"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <LeaguesHub embedded />
          </Suspense>
        </TabsContent>

        <TabsContent value="tournaments" className="mt-0 animate-in fade-in duration-300">
          <Suspense fallback={<div className="flex items-center justify-center py-32"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <TournamentsHub embedded />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
