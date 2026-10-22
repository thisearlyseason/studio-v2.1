"use client";

import { Component, ReactNode, Suspense, useState } from 'react';
import dynamic from 'next/dynamic';
import { Shield, Table as TableIcon, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTeam } from '@/components/providers/team-provider';

const LeaguesHub = dynamic(
  () => import('../leagues/leagues-page-content').then(m => ({ default: m.LeaguesPageContent })),
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
  () => import('../manage-tournaments/manage-tournaments-page-content').then(m => ({ default: m.ManageTournamentsPageContent })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    ),
  }
);

class CompetitionSectionErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[Competition Hub] Section failed to render:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-[2rem] border-2 border-dashed p-12 text-center space-y-4">
          <h2 className="text-xl font-black uppercase">Competition data could not be loaded</h2>
          <p className="text-sm text-muted-foreground">Refresh this section to retry without losing your account session.</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="rounded-xl bg-primary px-6 py-3 text-xs font-black uppercase text-white"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function CompetitionHubPage() {
  const { isSchoolMode } = useTeam();
  const [activeTab, setActiveTab] = useState<'leagues' | 'tournaments'>('leagues');
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
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'leagues' | 'tournaments')} className="w-full">
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
          {activeTab === 'leagues' && (
            <CompetitionSectionErrorBoundary>
              <Suspense fallback={<div className="flex items-center justify-center py-32"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
                <LeaguesHub embedded />
              </Suspense>
            </CompetitionSectionErrorBoundary>
          )}
        </TabsContent>

        <TabsContent value="tournaments" className="mt-0 animate-in fade-in duration-300">
          {activeTab === 'tournaments' && (
            <CompetitionSectionErrorBoundary>
              <Suspense fallback={<div className="flex items-center justify-center py-32"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
                <TournamentsHub embedded />
              </Suspense>
            </CompetitionSectionErrorBoundary>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
