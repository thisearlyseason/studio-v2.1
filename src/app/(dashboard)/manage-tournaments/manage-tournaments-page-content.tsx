"use client";

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Trophy, 
  Plus, 
  MapPin, 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  Clock, 
  ChevronRight,
  ArrowRight,
  Loader2,
  CalendarDays,
  Zap,
  Target,
  List,
  ShieldAlert,
  Edit3,
  ExternalLink,
  Users,
  FileSignature,
  Info,
  Lock,
  X,
  Download,
  Share2,
  Sparkles,
  Settings,
  Building,
  CheckCircle2,
  Save,
  Trash2,
  Signature,
  FileText,
  Play,
  Database,
  UserPlus,
  AlertCircle,
  Wallet,
  Share,
  ExternalLink as ExternalLinkIcon,
  Copy,
  UserCheck,
  UserMinus,
  Phone,
  Mail,
  RefreshCw
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription, 
  DialogFooter, 
  DialogClose
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { LocationAutocomplete } from '@/components/ui/LocationAutocomplete';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTeam, TeamEvent, TournamentGame, TournamentReferee, Member, Facility, Field, TeamDocument, League, RegistrationEntry } from '@/components/providers/team-provider';
import { AccessRestricted } from '@/components/layout/AccessRestricted';
import { useFirestore, useCollection, useMemoFirebase, useUser, useAuth } from '@/firebase';
import { collection, query, orderBy, where, doc, updateDoc, getDoc, getDocs, collectionGroup } from 'firebase/firestore';
import { cn, compressImage } from '@/lib/utils';
import { format, isPast, isSameDay, eachDayOfInterval, parseISO } from 'date-fns';
import { useRouter } from 'next/navigation';
import { toast } from '@/hooks/use-toast';
import { DailyWindow, TeamIdentity } from '@/lib/scheduler-utils';
import { generateIntelligentTournamentSchedule } from '@/lib/intelligent-scheduler';
import { ScrollArea } from '@/components/ui/scroll-area';
import html2canvas from 'html2canvas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TournamentBracket from '@/components/TournamentBracket';
import { SquadIdentity } from '@/components/SquadIdentity';
import { getFacilityFieldName } from '@/lib/facility-rename';
import { authHeader, getAuthToken } from '@/lib/client-auth';
import { calculateTournamentStandings } from '@/lib/tournament-standings';
import { EventSafetyPanel } from '@/components/safety/event-safety-panel';

interface TournamentTeam extends TeamIdentity {
  coach?: string;
  email?: string;
  source?: 'manual' | 'league' | 'pipeline';
  rosterLimit?: number;
  logoUrl?: string;
  division?: string;
}

function parseGameMinutes(time: string): number {
  const cleaned = (time || '0:00').replace(/\s/g, '').toLowerCase();
  const isPM = cleaned.endsWith('pm');
  const isAM = cleaned.endsWith('am');
  const [h, m] = cleaned.replace(/(am|pm)/, '').split(':').map(Number);
  let hours = isNaN(h) ? 0 : h;
  if (isPM && hours !== 12) hours += 12;
  if (isAM && hours === 12) hours = 0;
  return hours * 60 + (isNaN(m) ? 0 : m);
}

function findRefereeConflict(
  refereeId: string,
  targetGame: TournamentGame,
  otherGames: TournamentGame[],
  bufferMinutes = 90
): TournamentGame | null {
  const targetMin = parseGameMinutes(targetGame.time);
  return otherGames.find(g => {
    if ((g as any).refereeId !== refereeId) return false;
    if (g.date !== targetGame.date) return false;
    return Math.abs(parseGameMinutes(g.time) - targetMin) < bufferMinutes;
  }) ?? null;
}

function FacilityFieldLoader({ facilityId, selectedFields, onToggleField }: { facilityId: string, selectedFields: string[], onToggleField: (name: string) => void }) {
  const db = useFirestore();
  const q = useMemoFirebase(() => db ? query(collection(db, 'facilities', facilityId, 'fields'), orderBy('name', 'asc')) : null, [db, facilityId]);
  const { data: fields } = useCollection<Field>(q);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pl-6">
      {fields?.map(field => {
        const fieldIdentifier = `${facilityId}:${field.name}`;
        const isSelected = selectedFields.includes(fieldIdentifier);
        return (
          <div 
            key={field.id} 
            className={cn(
              "p-3 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between group",
              isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-muted hover:border-muted-foreground/20"
            )}
            onClick={() => onToggleField(fieldIdentifier)}
          >
            <span className="text-[10px] font-black uppercase tracking-widest truncate">{field.name}</span>
            {isSelected ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <div className="h-3.5 w-3.5 rounded-full border-2 border-muted group-hover:border-muted-foreground/30" />}
          </div>
        );
      })}
    </div>
  );
}

interface DivisionConfig {
  tournamentType: 'round_robin' | 'single_elimination' | 'double_elimination' | 'pool_play_knockout';
  gameLength: string;
  breakLength: string;
  gamesPerTeam: string;
  maxDailyGamesPerTeam: string;
  poolCount: string;
  advancePerPool: string;
  venueType: 'club' | 'custom';
  selectedFacilityId: string;
  allocatedFields: string[];
  customVenueName: string;
  customFieldsText: string;
  dailyWindows: DailyWindow[];
}

const getDefaultDivisionConfig = (startDate = '', endDate = ''): DivisionConfig => {
  let dailyWindows: DailyWindow[] = [];
  if (startDate && endDate) {
    try {
      const [sy, sm, sd] = startDate.split('-').map(Number);
      const [ey, em, ed] = endDate.split('-').map(Number);
      const startD = new Date(sy, sm - 1, sd, 12, 0, 0);
      const endD = new Date(ey, em - 1, ed, 12, 0, 0);
      if (!isNaN(startD.getTime()) && !isNaN(endD.getTime())) {
        const days = eachDayOfInterval({ start: startD, end: endD });
        dailyWindows = days.map(d => ({
          date: format(d, 'yyyy-MM-dd'),
          startTime: '08:00',
          endTime: '20:00'
        }));
      }
    } catch (e) { console.error(e); }
  }
  return {
    tournamentType: 'round_robin',
    gameLength: '60',
    breakLength: '15',
    gamesPerTeam: '3',
    maxDailyGamesPerTeam: '3',
    poolCount: '2',
    advancePerPool: '2',
    venueType: 'club',
    selectedFacilityId: '',
    allocatedFields: [],
    customVenueName: '',
    customFieldsText: '',
    dailyWindows
  };
};

function TournamentDeploymentWizard({ isOpen, onOpenChange, onComplete, editEvent }: { isOpen: boolean, onOpenChange: (o: boolean) => void, onComplete: () => void, editEvent?: TeamEvent }) {
  const { activeTeam, user, hasFeature, isStarter, addEvent } = useTeam();
  const db = useFirestore();
  const firebaseAuth = useAuth();

  const [step, setStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeWizardDivision, setActiveWizardDivision] = useState<string>('');
  const [activeLogisticsDivision, setActiveLogisticsDivision] = useState<string>('');
  const [copyDivisionTargets, setCopyDivisionTargets] = useState<string[]>([]);
  const [copiedDivisionNames, setCopiedDivisionNames] = useState<string[]>([]);

  const [form, setForm] = useState({
    title: '',
    startDate: '',
    endDate: '',
    location: '',
    description: '',
    tournamentType: 'round_robin' as 'round_robin' | 'single_elimination' | 'double_elimination' | 'pool_play_knockout',
    gameLength: '60',
    breakLength: '15',
    gamesPerTeam: '3',
    maxDailyGamesPerTeam: '3',
    poolCount: '2',
    advancePerPool: '2',
    dailyWindows: [] as DailyWindow[],
    selectedFields: [] as string[],
    manualVenue: '',
    waiverIds: [] as string[],
    registration_cost: '0',
    teams: [] as TournamentTeam[],
    adminEmails: [] as string[],
    sport: activeTeam?.sport || 'General',
    divisionTitle: '',
    stagedDivisions: [] as string[],
    divisionConfigs: {} as Record<string, DivisionConfig>
  });

  const [typeChangeWarning, setTypeChangeWarning] = useState(false);

  // When step 2 (Roster) is entered, auto-select first staged division if empty
  useEffect(() => {
    if (step === 2 && form.stagedDivisions.length > 0 && !activeWizardDivision) {
      setActiveWizardDivision(form.stagedDivisions[0]);
    }
  }, [step, form.stagedDivisions, activeWizardDivision]);

  // When step 3 (Logistics) is entered, auto-select first staged division if empty
  useEffect(() => {
    if (step === 3 && form.stagedDivisions.length > 0 && !activeLogisticsDivision) {
      setActiveLogisticsDivision(form.stagedDivisions[0]);
    } else if (step === 3 && form.stagedDivisions.length === 0) {
      setActiveLogisticsDivision('Default');
    }
  }, [step, form.stagedDivisions, activeLogisticsDivision]);

  useEffect(() => {
    if (isOpen && editEvent) {
      const divTitle = editEvent.divisionTitle || '';
      const divKey = divTitle || 'Default';
      const initialConfig: DivisionConfig = {
        tournamentType: (editEvent.tournamentType as any) || 'round_robin',
        gameLength: editEvent.gameLength?.toString() || '60',
        breakLength: editEvent.breakLength?.toString() || '15',
        gamesPerTeam: editEvent.gamesPerTeam?.toString() || '3',
        maxDailyGamesPerTeam: String(editEvent.maxDailyGamesPerTeam || 3),
        poolCount: String((editEvent as any).poolCount || 2),
        advancePerPool: String((editEvent as any).advancePerPool || 2),
        venueType: editEvent.manualVenue ? 'custom' : 'club',
        selectedFacilityId: '',
        allocatedFields: editEvent.selectedFields || [],
        customVenueName: editEvent.manualVenue || '',
        customFieldsText: editEvent.manualVenue ? (editEvent.selectedFields || []).join(', ') : '',
        dailyWindows: editEvent.dailyWindows || []
      };

      setForm({
        title: editEvent.title || '',
        startDate: editEvent.date ? new Date(editEvent.date).toISOString().split('T')[0] : '',
        endDate: editEvent.endDate ? new Date(editEvent.endDate).toISOString().split('T')[0] : '',
        location: editEvent.location || '',
        description: editEvent.description || '',
        tournamentType: (editEvent.tournamentType as any) || 'round_robin',
        gameLength: editEvent.gameLength?.toString() || '60',
        breakLength: editEvent.breakLength?.toString() || '15',
        gamesPerTeam: editEvent.gamesPerTeam?.toString() || '3',
        maxDailyGamesPerTeam: String(editEvent.maxDailyGamesPerTeam || 3),
        poolCount: String((editEvent as any).poolCount || 2),
        advancePerPool: String((editEvent as any).advancePerPool || 2),
        dailyWindows: editEvent.dailyWindows || [],
        selectedFields: editEvent.selectedFields || [],
        manualVenue: editEvent.manualVenue || '',
        waiverIds: editEvent.waiverIds || [],
        registration_cost: editEvent.registrationCost || '0',
        teams: editEvent.tournamentTeamsData || [],
        adminEmails: editEvent.adminEmails || [],
        sport: editEvent.sport || activeTeam?.sport || 'General',
        divisionTitle: editEvent.divisionTitle || '',
        stagedDivisions: [],
        divisionConfigs: { [divKey]: initialConfig }
      });
      setActiveWizardDivision('');
      setActiveLogisticsDivision('');
      setCopiedDivisionNames([]);
      setStep(1);
    } else if (isOpen && !editEvent) {
      // Reset for new creation
      setForm({
        title: '',
        startDate: '',
        endDate: '',
        location: '',
        description: '',
        tournamentType: 'round_robin',
        gameLength: '60',
        breakLength: '15',
        gamesPerTeam: '3',
        maxDailyGamesPerTeam: '3',
        poolCount: '2',
        advancePerPool: '2',
        dailyWindows: [],
        selectedFields: [],
        manualVenue: '',
        waiverIds: [],
        registration_cost: '0',
        teams: [],
        adminEmails: [],
        sport: activeTeam?.sport || 'General',
        divisionTitle: '',
        stagedDivisions: [],
        divisionConfigs: {}
      });
      setActiveWizardDivision('');
      setActiveLogisticsDivision('');
      setStep(1);
    }
  }, [isOpen, editEvent, activeTeam?.sport]);

  const facilitiesQuery = useMemoFirebase(() => {
    if (!db || !user?.id) return null;
    return query(collection(db, 'facilities'), where('clubId', '==', user.id));
  }, [db, user?.id]);
  const { data: facilities } = useCollection<Facility>(facilitiesQuery);

  const docsQuery = useMemoFirebase(() => {
    if (!db || !activeTeam?.id) return null;
    return query(collection(db, 'teams', activeTeam.id, 'documents'), orderBy('createdAt', 'desc'));
  }, [db, activeTeam?.id]);
  const { data: documents } = useCollection<TeamDocument>(docsQuery);

  const leaguesQuery = useMemoFirebase(() => {
    if (!db || !user?.id) return null;
    return query(collection(db, 'leagues'), where('creatorId', '==', user.id));
  }, [db, user?.id]);
  const { data: leagues } = useCollection<League>(leaguesQuery);

  const initDailyWindows = () => {
    if (!form.startDate || !form.endDate) return;
    const divs = form.stagedDivisions.length > 0 ? form.stagedDivisions : [form.divisionTitle.trim() || 'Default'];
    const newConfigs: Record<string, DivisionConfig> = { ...form.divisionConfigs };
    
    for (const div of divs) {
      if (!newConfigs[div]) {
        newConfigs[div] = getDefaultDivisionConfig(form.startDate, form.endDate);
      } else if (!newConfigs[div].dailyWindows || newConfigs[div].dailyWindows.length === 0) {
        const defaultCfg = getDefaultDivisionConfig(form.startDate, form.endDate);
        newConfigs[div].dailyWindows = defaultCfg.dailyWindows;
      }
    }
    
    setForm(p => ({
      ...p,
      divisionConfigs: newConfigs
    }));
  };

  const validateBaseConfiguration = () => {
    if (!form.title.trim() || !form.startDate || !form.endDate) {
      toast({
        title: 'Base Configuration Incomplete',
        description: 'Enter a series title, commencement date, and conclusion date.',
        variant: 'destructive',
      });
      return false;
    }
    if (form.endDate < form.startDate) {
      toast({
        title: 'Invalid Tournament Dates',
        description: 'The conclusion date cannot be before the commencement date.',
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  const validateRosterMatrix = () => {
    const namedTeams = form.teams.filter(team => team.name.trim());
    if (namedTeams.length !== form.teams.length) {
      toast({
        title: 'Squad Matrix Incomplete',
        description: 'Name every staged squad or remove unused squad rows before continuing.',
        variant: 'destructive',
      });
      return false;
    }
    if (form.stagedDivisions.length > 0) {
      const incompleteDivisions = form.stagedDivisions.filter(division =>
        namedTeams.filter(team => team.division === division).length < 2
      );
      if (incompleteDivisions.length > 0) {
        toast({
          title: 'Squad Matrix Incomplete',
          description: `Add at least two named squads to: ${incompleteDivisions.join(', ')}.`,
          variant: 'destructive',
        });
        return false;
      }
    } else if (namedTeams.length < 2) {
      toast({
        title: 'Squad Matrix Incomplete',
        description: 'Add at least two named squads before configuring tournament logistics.',
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1) {
      if (!validateBaseConfiguration()) return;
      initDailyWindows();
    }
    if (step === 2 && !validateRosterMatrix()) return;
    setStep(step + 1);
  };

  const handleStepSelection = (nextStep: number) => {
    if (nextStep > 1 && !validateBaseConfiguration()) {
      setStep(1);
      return;
    }
    if (nextStep > 2 && !validateRosterMatrix()) {
      setStep(2);
      return;
    }
    if (nextStep > step && step === 1) initDailyWindows();
    setStep(nextStep);
  };

  const importLeagueTeams = (leagueId: string) => {
    const league = leagues?.find(l => l.id === leagueId);
    if (!league?.teams) return;
    const teamsToImport = Object.entries(league.teams).map(([id, t]) => ({
      id: `l_${id}`,
      name: t.teamName,
      coach: t.coachName || 'League Coach',
      email: t.coachEmail || '',
      source: 'league' as const,
      logoUrl: (t as any).teamLogoUrl,
      division: form.stagedDivisions.length > 0 ? activeWizardDivision : undefined
    }));
    setForm(p => ({ ...p, teams: [...p.teams, ...teamsToImport] }));
    toast({ title: "Teams Imported" });
  };

  const handleDeploy = async () => {
    if (!validateBaseConfiguration()) {
      setStep(1);
      return;
    }
    if (!validateRosterMatrix()) {
      setStep(2);
      return;
    }
    setIsProcessing(true);

    const deploySingleEvent = async (divTitle?: string) => {
      const filteredTeams = divTitle
        ? form.teams.filter(t => t.division === divTitle)
        : form.teams;

      const divKey = divTitle || 'Default';
      const divConfig = form.divisionConfigs[divKey] || getDefaultDivisionConfig(form.startDate, form.endDate);
      if (filteredTeams.length < 2) {
        throw new Error(`At least two squads are required for ${divTitle || 'the tournament'}. Add squads in Phase 2 before deployment.`);
      }

      // Determine fields and manual venue based on venueType
      const rawFields = divConfig.venueType === 'club'
        ? divConfig.allocatedFields
        : divConfig.customFieldsText.split(',').map(field => field.trim()).filter(Boolean);
      const selectedFields = rawFields.filter((field, index) =>
        rawFields.findIndex(candidate => candidate.toLowerCase() === field.toLowerCase()) === index
      );
      const manualVenue = divConfig.venueType === 'club' ? '' : divConfig.customVenueName;
      const gameLength = Number(divConfig.gameLength);
      const breakLength = Number(divConfig.breakLength);
      const gamesPerTeam = Number(divConfig.gamesPerTeam);
      const maxDailyGamesPerTeam = Number(divConfig.maxDailyGamesPerTeam);
      const configuredPoolCount = Number(divConfig.poolCount);
      const configuredAdvancePerPool = Number(divConfig.advancePerPool);
      if (
        !Number.isInteger(gameLength) || gameLength <= 0 ||
        !Number.isInteger(breakLength) || breakLength < 0 ||
        !Number.isInteger(gamesPerTeam) || gamesPerTeam <= 0 ||
        !Number.isInteger(maxDailyGamesPerTeam) || maxDailyGamesPerTeam <= 0 ||
        selectedFields.length === 0 ||
        (divConfig.dailyWindows || []).some(window => !window.startTime || !window.endTime || window.startTime >= window.endTime)
      ) {
        throw new Error(`Invalid scheduling settings for ${divTitle || 'the tournament'}. Check fields, match length, rest time, games, and daily windows.`);
      }
      if (divConfig.tournamentType === 'pool_play_knockout') {
        const maxPoolCount = Math.floor(filteredTeams.length / 2);
        if (
          !Number.isInteger(configuredPoolCount) || configuredPoolCount < 2 || configuredPoolCount > maxPoolCount ||
          !Number.isInteger(configuredAdvancePerPool) || configuredAdvancePerPool < 1 ||
          configuredAdvancePerPool > Math.floor(filteredTeams.length / configuredPoolCount)
        ) {
          throw new Error(`Pool settings for ${divTitle || 'the tournament'} require at least two teams per pool and a valid number of qualifiers per pool.`);
        }
      }
      let finalLocation = form.location;
      if (divConfig.venueType === 'club' && divConfig.selectedFacilityId) {
        const fac = facilities?.find(f => f.id === divConfig.selectedFacilityId);
        if (fac) finalLocation = fac.name;
      } else if (divConfig.venueType === 'custom' && divConfig.customVenueName) {
        finalLocation = divConfig.customVenueName;
      }

      const eventPayload = {
        title: form.title,
        date: new Date(form.startDate + 'T12:00:00').toISOString(),
        endDate: new Date((form.endDate || form.startDate) + 'T12:00:00').toISOString(),
        location: finalLocation,
        description: form.description,
        eventType: 'tournament',
        isTournament: true,
        tournamentTeamsData: filteredTeams,
        tournamentTeams: filteredTeams.map(t => t.name),
        waiverIds: form.waiverIds,
        waiverDocuments: (documents || []).filter(document => form.waiverIds.includes(document.id)).map(document => ({
          id: document.id, title: document.title, content: document.content || '',
        })),
        teamWaiverText: (documents || []).filter(document => form.waiverIds.includes(document.id)).map(document => `${document.title}\n\n${document.content || ''}`).join('\n\n'),
        registrationCost: form.registration_cost,
        gameLength,
        breakLength,
        gamesPerTeam,
        maxDailyGamesPerTeam,
        poolCount: Math.max(2, configuredPoolCount || 2),
        advancePerPool: Math.max(1, configuredAdvancePerPool || 2),
        dailyWindows: divConfig.dailyWindows || [],
        selectedFields: selectedFields,
        manualVenue: manualVenue,
        tournamentType: divConfig.tournamentType || 'round_robin',
        adminEmails: form.adminEmails || [],
        sport: form.sport.trim() || activeTeam?.sport || 'General',
        divisionTitle: divTitle || '',
        setupStatus: 'complete' as const,
        bracketStatus: 'pending' as const,
        scheduleStatus: 'pending' as const,
        deploymentStatus: 'undeployed' as const,
        deploymentError: ''
      };

      if (editEvent) {
        const previousDefinition = {
          date: editEvent.date ? new Date(editEvent.date).toISOString().split('T')[0] : '',
          endDate: editEvent.endDate ? new Date(editEvent.endDate).toISOString().split('T')[0] : '',
          tournamentType: editEvent.tournamentType || 'round_robin',
          teamIds: (editEvent.tournamentTeamsData || []).map(team => `${team.id}:${team.name}`),
          gameLength: Number(editEvent.gameLength || 60),
          breakLength: Number(editEvent.breakLength || 15),
          gamesPerTeam: Number(editEvent.gamesPerTeam || 3),
          maxDailyGamesPerTeam: Number(editEvent.maxDailyGamesPerTeam || 3),
          poolCount: Number((editEvent as any).poolCount || 2),
          advancePerPool: Number((editEvent as any).advancePerPool || 2),
          selectedFields: editEvent.selectedFields || [],
          dailyWindows: editEvent.dailyWindows || [],
          manualVenue: editEvent.manualVenue || '',
        };
        const nextDefinition = {
          date: form.startDate,
          endDate: form.endDate || form.startDate,
          tournamentType: divConfig.tournamentType || 'round_robin',
          teamIds: filteredTeams.map(team => `${team.id}:${team.name}`),
          gameLength,
          breakLength,
          gamesPerTeam,
          maxDailyGamesPerTeam,
          poolCount: Math.max(2, configuredPoolCount || 2),
          advancePerPool: Math.max(1, configuredAdvancePerPool || 2),
          selectedFields,
          dailyWindows: divConfig.dailyWindows || [],
          manualVenue,
        };
        const scheduleDefinitionChanged = JSON.stringify(previousDefinition) !== JSON.stringify(nextDefinition);
        if (scheduleDefinitionChanged && (editEvent.tournamentGames || []).length > 0) {
          const token = await getAuthToken(firebaseAuth);
          if (!token) throw new Error('Your session has expired. Sign in again.');
          const response = await fetch('/api/tournaments/schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader(token) },
            body: JSON.stringify({ action: 'clear', teamId: activeTeam!.id, eventId: editEvent.id }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || 'Unable to invalidate the previous tournament schedule.');
        }
        await updateDoc(doc(db, 'teams', activeTeam!.id, 'events', editEvent.id), eventPayload);
        return true;
      } else {
        return await addEvent(eventPayload);
      }
    };

    let success = false;
    try {
      if (editEvent) {
        success = await deploySingleEvent(form.divisionTitle.trim() || undefined);
      } else {
        if (form.stagedDivisions.length > 0) {
          for (const div of form.stagedDivisions) {
            success = await deploySingleEvent(div);
          }
        } else {
          success = await deploySingleEvent(form.divisionTitle.trim() || undefined);
        }
      }

      if (success) { 
        onOpenChange(false); 
        onComplete(); 
        toast({
          title: editEvent ? "Setup Updated" : "Tournament Setup Complete",
          description: editEvent
            ? "Configuration saved. Regenerate the schedule if any scheduling inputs changed."
            : "The tournament is saved as undeployed. Generate its schedule to initialize the bracket and publish fixtures."
        });
      }
    } catch (e: any) {
      console.error("[Tournaments] Deployment failed:", e);
      toast({ title: "Deployment Failed", description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="max-w-[98vw] lg:max-w-[1600px] rounded-[3rem] p-0 border border-white/10 shadow-2xl overflow-hidden bg-[#050505] text-white h-[95vh] flex flex-col">
        <DialogTitle className="sr-only">Elite Series Architect</DialogTitle>
        <DialogDescription className="sr-only">
          Configure tournament identity, teams, format, venues, and schedule before deployment.
        </DialogDescription>
        <DialogClose className="absolute right-6 top-6 z-50 h-10 w-10 rounded-full border border-white/20 bg-white/5 hover:bg-white/15 transition-all flex items-center justify-center backdrop-blur-sm">
          <X className="h-5 w-5 text-white" />
          <span className="sr-only">Close</span>
        </DialogClose>
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-red-600 via-orange-500 to-primary w-full shrink-0" />
        
        <div className="flex flex-1 overflow-hidden">
          {/* Left Navigation Matrix */}
          <div className="w-[320px] bg-[#0a0a0a] border-r border-white/5 p-10 flex flex-col hidden lg:flex relative">
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
            <div className="relative z-10 flex items-center gap-4 mb-20">
              <div className="border border-white/20 p-3 rounded-xl shadow-[0_0_15px_rgba(255,255,255,0.1)] text-white"><Database className="h-5 w-5" /></div>
              <div>
                 <h2 className="text-xl font-black uppercase tracking-tight">System<br/>Architect</h2>
              </div>
            </div>
            
            <div className="relative z-10 space-y-8 flex-1">
               {[
                 {num: 1, title: 'Strategic Initialization', desc: 'Identify Identity & Venue Constraints'},
                 {num: 2, title: 'Squad Procurement', desc: 'Lock Rosters & Registration'},
                 {num: 3, title: 'Field Matrix & Chrono', desc: 'Format Constraints & Timeslots'},
                 {num: 4, title: 'Pre-Flight Audit', desc: 'Verify Operational Telemetry'},
               ].map((s) => (
                 <div key={s.num} 
                   className={cn(
                     "relative pl-8 transition-all duration-300 cursor-pointer hover:opacity-100",
                     step === s.num ? "opacity-100" : "opacity-30"
                   )}
                   onClick={() => handleStepSelection(s.num)}
                 >
                   <div className={cn(
                     "absolute left-0 top-1 bottom-1 w-[2px]",
                     step === s.num ? "bg-primary shadow-[0_0_10px_rgba(var(--primary),0.8)]" : "bg-white/10"
                   )} />
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Phase {s.num}</h4>
                   <h3 className="text-sm font-black uppercase tracking-tight mb-1">{s.title}</h3>
                   <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">{s.desc}</p>
                 </div>
               ))}
            </div>
            
            <div className="mt-auto border-t border-white/10 pt-8 relative z-10">
               <div className="flex items-center gap-2 text-emerald-500 font-black text-[9px] uppercase tracking-[0.2em]"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Studio Engine Online</div>
            </div>
          </div>

          {/* Right Content Execution Area */}
          <div className="flex-1 flex flex-col overflow-hidden relative">
            <div className="absolute top-10 right-10 opacity-5 pointer-events-none w-64 h-64"><Trophy className="w-full h-full" /></div>
            
            <ScrollArea showScrollHint scrollHintLabel="More tournament settings" className="flex-1 px-6 sm:px-8 lg:px-16 pt-12 sm:pt-16 pb-32 min-h-0">
              <div className="max-w-3xl mx-auto space-y-12">
                {step === 1 && (
                  <div className="space-y-12 animate-in slide-in-from-right-4 duration-500">
                    <div>
                      <Badge className="bg-primary/20 text-primary border border-primary/30 uppercase font-black tracking-widest text-[8px] mb-4">Phase 1: Base Configuration</Badge>
                      <h3 className="text-4xl font-black uppercase tracking-tighter mb-2 text-white">Identity & Operations</h3>
                      <p className="text-sm font-bold opacity-40 uppercase tracking-widest">Define the foundational parameters of this elite deployment.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-8">
                      <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Official Series Designation</Label>
                        <Input placeholder="e.g. 2024 CHAMPIONSHIP INVITATIONAL" value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="h-16 rounded-2xl bg-white/15 border-white/20 font-black text-2xl text-white placeholder:text-white/30 uppercase focus-visible:ring-primary focus-visible:border-primary px-6 transition-all shadow-inner" />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Sport Type</Label>
                          <Input placeholder="e.g. Basketball, Soccer" value={form.sport} onChange={e => setForm({...form, sport: e.target.value})} className="h-14 rounded-xl bg-white/15 border-white/20 font-bold text-white px-6 shadow-inner" />
                        </div>
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Divisions <span className="text-white/30 font-normal">(Optional)</span></Label>
                          <div className="flex gap-2">
                            <Input 
                              placeholder="Press enter or click Add to stage multiple" 
                              value={form.divisionTitle} 
                              onChange={e => setForm({...form, divisionTitle: e.target.value})} 
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (form.divisionTitle.trim()) {
                                    if (!form.stagedDivisions.includes(form.divisionTitle.trim())) {
                                      setForm({
                                        ...form,
                                        stagedDivisions: [...form.stagedDivisions, form.divisionTitle.trim()],
                                        divisionTitle: ''
                                      });
                                    } else {
                                      setForm({ ...form, divisionTitle: '' });
                                    }
                                  }
                                }
                              }}
                              className="h-14 rounded-xl bg-white/15 border-white/20 font-bold text-white px-6 shadow-inner flex-1" 
                            />
                            <Button 
                              type="button"
                              onClick={() => {
                                if (form.divisionTitle.trim()) {
                                  if (!form.stagedDivisions.includes(form.divisionTitle.trim())) {
                                    setForm({
                                      ...form,
                                      stagedDivisions: [...form.stagedDivisions, form.divisionTitle.trim()],
                                      divisionTitle: ''
                                    });
                                  } else {
                                    setForm({ ...form, divisionTitle: '' });
                                  }
                                }
                              }}
                              className="h-14 rounded-xl bg-white text-black hover:bg-white/90 px-6 font-black uppercase text-xs"
                            >
                              Add
                            </Button>
                          </div>
                          {form.stagedDivisions.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-2">
                              {form.stagedDivisions.map((div, idx) => (
                                <Badge 
                                  key={idx} 
                                  className="bg-primary/20 text-primary border-primary/30 font-black text-[10px] h-8 px-3.5 rounded-full flex items-center gap-1.5 uppercase tracking-wider"
                                >
                                  {div}
                                  <button 
                                    type="button" 
                                    aria-label={`Remove ${div} division`}
                                    onClick={() => setForm({ ...form, stagedDivisions: form.stagedDivisions.filter(d => d !== div) })}
                                    className="hover:text-red-500 transition-colors"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8">
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Commencement Date</Label>
                          <Input type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} style={{ colorScheme: 'dark' }} className="h-14 rounded-xl bg-white/15 border-white/20 font-bold text-white uppercase focus-visible:ring-primary px-6 shadow-inner" />
                        </div>
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Conclusion Date</Label>
                          <Input type="date" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} style={{ colorScheme: 'dark' }} className="h-14 rounded-xl bg-white/15 border-white/20 font-bold text-white uppercase focus-visible:ring-primary px-6 shadow-inner" />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8">
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Central Hub/Venue</Label>
                          <LocationAutocomplete
                          value={form.location}
                          onChange={(val) => setForm({...form, location: val})}
                          placeholder="Search venue or enter address…"
                          inputClassName="h-14 rounded-xl bg-white/15 border-white/20 font-bold text-white focus-visible:ring-primary px-6 shadow-inner pl-9"
                        />
                        </div>
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Registration Toll ($)</Label>
                          <Input type="number" min="0" value={form.registration_cost} onChange={e => setForm({...form, registration_cost: e.target.value})} className="h-14 rounded-xl bg-white/15 border-white/20 font-black text-xl text-primary focus-visible:ring-primary px-6 shadow-inner" />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8">
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Admin Email 1</Label>
                          <Input type="email" placeholder="coach@example.com" value={form.adminEmails[0] || ''} onChange={e => {const n=[...form.adminEmails]; n[0]=e.target.value; setForm({...form, adminEmails:n});}} className="h-14 rounded-xl bg-white/15 border-white/20 font-bold text-white focus-visible:ring-primary px-6 shadow-inner" />
                        </div>
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Admin Email 2</Label>
                          <Input type="email" placeholder="staff@example.com" value={form.adminEmails[1] || ''} onChange={e => {const n=[...form.adminEmails]; n[1]=e.target.value; setForm({...form, adminEmails:n});}} className="h-14 rounded-xl bg-white/15 border-white/20 font-bold text-white focus-visible:ring-primary px-6 shadow-inner" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                 {step === 2 && (
                  <div className="space-y-12 animate-in slide-in-from-right-4 duration-500">
                    <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-white/5 pb-8 mb-8 gap-6">
                      <div className="flex-1">
                        <Badge className="bg-primary/20 text-primary border border-primary/30 uppercase font-black tracking-widest text-[8px] mb-4">Phase 2: Roster Matrix</Badge>
                        <h3 className="text-4xl font-black uppercase tracking-tighter mb-2 text-white">Squad Initialization</h3>
                        <p className="text-sm font-bold opacity-40 uppercase tracking-widest">Target and lock competitor slots for the series schedule.</p>
                      </div>
                      <div className="flex flex-wrap gap-2 justify-end">
                         {leagues && leagues.length > 0 && (
                           <Select onValueChange={importLeagueTeams}>
                             <SelectTrigger className="bg-white/5 border-white/10 text-white h-10 w-[180px] font-black uppercase text-[9px] tracking-widest">
                               <SelectValue placeholder="Import League" />
                             </SelectTrigger>
                             <SelectContent className="bg-[#0a0a0a] border-white/10 text-white font-black uppercase text-[9px]">
                               {leagues.map(l => (
                                 <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                               ))}
                             </SelectContent>
                           </Select>
                         )}
                         <Button className="bg-white text-black hover:bg-white/80 h-10 font-black uppercase tracking-widest text-[9px]" onClick={() => setForm({...form, teams: [...form.teams, {id:`m_${Date.now()}`, name:'', coach:'', email:'', source:'manual', division: form.stagedDivisions.length > 0 ? activeWizardDivision : undefined}]})}>Add Direct Asset</Button>
                      </div>
                    </div>

                    {form.stagedDivisions.length > 0 && (
                      <div className="space-y-4 border-b border-white/5 pb-5 mb-4 text-left">
                       <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40 mr-2">Target Division:</span>
                        <div className="flex flex-wrap gap-2">
                          {form.stagedDivisions.map(div => (
                            <button
                              key={div}
                              type="button"
                              onClick={() => setActiveWizardDivision(div)}
                              className={cn(
                                "h-9 px-4 rounded-xl font-black text-[10px] uppercase border transition-all",
                                activeWizardDivision === div 
                                  ? "bg-primary text-white border-primary" 
                                  : "bg-white/5 text-white/60 border-white/10 hover:border-white/30"
                              )}
                            >
                              {div}
                              {copiedDivisionNames.includes(div) && <span className="ml-2 text-[7px] opacity-70">Copied • Draft</span>}
                            </button>
                          ))}
                        </div>
                       </div>
                       {form.stagedDivisions.length > 1 && (
                         <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                           <div className="flex flex-wrap items-center justify-between gap-3">
                             <div>
                               <p className="text-[10px] font-black uppercase tracking-widest text-white">Copy Division Settings</p>
                               <p className="text-[9px] font-bold text-white/40 uppercase">Copies logistics only. Teams and deployed schedules are never copied.</p>
                             </div>
                             <Button type="button" variant="outline" className="h-9 border-white/15 bg-white/5 text-white text-[9px] font-black uppercase" onClick={() => setCopyDivisionTargets(form.stagedDivisions.filter(d => d !== activeLogisticsDivision))}>Select All Others</Button>
                           </div>
                           <div className="flex flex-wrap gap-2">
                             {form.stagedDivisions.filter(d => d !== activeLogisticsDivision).map(div => (
                               <label key={div} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[9px] font-black uppercase text-white/70 cursor-pointer">
                                 <input type="checkbox" checked={copyDivisionTargets.includes(div)} onChange={e => setCopyDivisionTargets(current => e.target.checked ? [...current, div] : current.filter(item => item !== div))} />
                                 {div}
                               </label>
                             ))}
                           </div>
                           <Button type="button" disabled={copyDivisionTargets.length === 0} className="h-10 bg-primary text-white text-[9px] font-black uppercase" onClick={() => {
                             const source = form.divisionConfigs[activeLogisticsDivision] || getDefaultDivisionConfig(form.startDate, form.endDate);
                             setForm(current => ({
                               ...current,
                               divisionConfigs: copyDivisionTargets.reduce((configs, target) => ({ ...configs, [target]: structuredClone(source) }), current.divisionConfigs),
                             }));
                             toast({ title: 'Division Settings Copied', description: `${copyDivisionTargets.length} division${copyDivisionTargets.length === 1 ? '' : 's'} updated as undeployed drafts.` });
                             setCopiedDivisionNames(current => [...new Set([...current, ...copyDivisionTargets])]);
                             setCopyDivisionTargets([]);
                           }}><Copy className="h-3.5 w-3.5 mr-2" /> Copy to Selected</Button>
                         </div>
                       )}
                      </div>
                    )}
                    
                    <div className="space-y-4">
                      {form.teams.map((t, i) => {
                        const isVisible = form.stagedDivisions.length === 0 || t.division === activeWizardDivision;
                        if (!isVisible) return null;
                        return (
                          <div key={t.id} className="bg-white/5 p-5 rounded-[2rem] border border-white/5 hover:bg-white/10 transition-colors group relative overflow-hidden space-y-3">
                            {t.source && (
                              <div className={cn(
                                "absolute top-0 right-12 px-3 py-1 text-[7px] font-black uppercase tracking-widest rounded-b-lg",
                                t.source === 'league' ? "bg-emerald-500/20 text-emerald-500" :
                                t.source === 'pipeline' ? "bg-primary/20 text-primary" :
                                "bg-white/10 text-white/40"
                              )}>
                                {t.source}
                              </div>
                            )}
                            <div className="flex flex-col sm:grid sm:grid-cols-12 gap-2 sm:gap-3 items-stretch sm:items-center">
                              <div className="hidden sm:block sm:col-span-1 text-[10px] font-black opacity-20">T{i+1}</div>
                              <div className="sm:col-span-5">
                                <Input value={t.name} onChange={e => {const n=[...form.teams]; n[i].name=e.target.value; setForm({...form, teams:n});}} placeholder="Squad Designation" className="h-12 bg-white/10 border-white/20 font-black uppercase rounded-xl text-white shadow-inner" />
                              </div>
                              <div className="sm:col-span-4">
                                <Input value={t.coach} onChange={e => {const n=[...form.teams]; n[i].coach=e.target.value; setForm({...form, teams:n});}} placeholder="Operator / Coach" className="h-12 bg-white/10 border-white/20 font-bold text-sm rounded-xl text-white shadow-inner" />
                              </div>
                              <div className="sm:col-span-2 flex justify-end">
                                 <Button variant="ghost" size="icon" onClick={() => setForm({...form, teams: form.teams.filter(x => x.id !== t.id)})} className="h-12 w-12 rounded-xl text-white/20 hover:text-red-500 hover:bg-red-500/10 transition-all"><X className="h-5 w-5" /></Button>
                              </div>
                            </div>
                            <div className="pl-8 pr-2">
                              <Input
                                type="email"
                                value={t.email || ''}
                                onChange={e => {const n=[...form.teams]; n[i].email=e.target.value; setForm({...form, teams:n});}}
                                placeholder="Team email — when they sign up with this email, matches auto-sync to their account (Starter plan)"
                                className="h-10 bg-white/5 border-white/10 font-medium text-sm rounded-xl text-white shadow-inner placeholder:text-white/20"
                              />
                            </div>
                          </div>
                        );
                      })}
                      {((form.stagedDivisions.length > 0 && form.teams.filter(t => t.division === activeWizardDivision).length === 0) || (form.stagedDivisions.length === 0 && form.teams.length === 0)) && (
                        <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-[3rem]">
                           <UserPlus className="h-10 w-10 mx-auto text-white/20 mb-4" />
                           <p className="text-white/40 font-black uppercase tracking-widest text-xs">No active squads engaged in the matrix.</p>
                           <p className="text-white/20 font-bold text-[10px] uppercase tracking-widest mt-2">Add a team email — when they sign up, matches auto-sync. Outside teams get Starter plan access.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {step === 3 && (
                  <div className="space-y-12 animate-in slide-in-from-right-4 duration-500">
                    <div>
                      <Badge className="bg-primary/20 text-primary border border-primary/30 uppercase font-black tracking-widest text-[8px] mb-4">Phase 3: Logistics Engine</Badge>
                      <h3 className="text-4xl font-black uppercase tracking-tighter mb-2 text-white">Division Logistics Configuration</h3>
                      <p className="text-sm font-bold opacity-40 uppercase tracking-widest">Calibrate format, dates, timeslots, and venue configurations for each division.</p>
                    </div>

                    <div className="rounded-[2rem] border border-white/10 bg-[#0a0a0a] p-6 text-left space-y-4">
                      <div>
                        <h4 className="font-black text-sm uppercase tracking-widest text-primary">Required Waivers</h4>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">Active Library &amp; Docs waivers apply to every tournament team, including manually added teams.</p>
                      </div>
                      <div className="grid gap-2">
                        {(documents || []).filter(document => document.type === 'waiver' && document.isActive !== false).map(document => (
                          <label key={document.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-white cursor-pointer">
                            <Checkbox checked={form.waiverIds.includes(document.id)} onCheckedChange={(checked: boolean | 'indeterminate') => setForm(current => ({ ...current, waiverIds: checked === true ? [...current.waiverIds, document.id] : current.waiverIds.filter(id => id !== document.id) }))} />
                            {document.title}
                          </label>
                        ))}
                        {(documents || []).filter(document => document.type === 'waiver' && document.isActive !== false).length === 0 && <p className="text-xs text-white/40">Create and activate a waiver in Library &amp; Docs before requiring one here.</p>}
                      </div>
                    </div>

                    {form.stagedDivisions.length > 0 && (
                      <div className="flex items-center gap-2 border-b border-white/5 pb-4 mb-4 text-left">
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40 mr-2">Configuring Division:</span>
                        <div className="flex flex-wrap gap-2">
                          {form.stagedDivisions.map(div => (
                            <button
                              key={div}
                              type="button"
                              onClick={() => setActiveLogisticsDivision(div)}
                              className={cn(
                                "h-9 px-4 rounded-xl font-black text-[10px] uppercase border transition-all",
                                activeLogisticsDivision === div 
                                  ? "bg-primary text-white border-primary" 
                                  : "bg-white/5 text-white/60 border-white/10 hover:border-white/30"
                              )}
                            >
                              {div}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {(() => {
                      const activeDivName = form.stagedDivisions.length > 0 ? activeLogisticsDivision : (form.divisionTitle.trim() || 'Default');
                      const activeConfig = form.divisionConfigs[activeDivName] || getDefaultDivisionConfig(form.startDate, form.endDate);
                      const updateActiveConfig = (updates: Partial<DivisionConfig>) => {
                        setForm(p => ({
                          ...p,
                          divisionConfigs: {
                            ...p.divisionConfigs,
                            [activeDivName]: {
                              ...activeConfig,
                              ...updates
                            }
                          }
                        }));
                      };

                      const generateDailyWindowsForActive = () => {
                        if (!form.startDate || !form.endDate) return;
                        try {
                          const [sy, sm, sd] = form.startDate.split('-').map(Number);
                          const [ey, em, ed] = form.endDate.split('-').map(Number);
                          const startD = new Date(sy, sm - 1, sd, 12, 0, 0);
                          const endD = new Date(ey, em - 1, ed, 12, 0, 0);
                          if (isNaN(startD.getTime()) || isNaN(endD.getTime())) return;
                          const days = eachDayOfInterval({ start: startD, end: endD });
                          updateActiveConfig({
                            dailyWindows: days.map(d => ({
                              date: format(d, 'yyyy-MM-dd'),
                              startTime: '08:00',
                              endTime: '20:00'
                            }))
                          });
                        } catch (e) { console.error(e); }
                      };

                      return (
                        <div className="space-y-8">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* Card 1: Format & Chrono Sync */}
                            <div className="bg-[#0a0a0a] p-8 rounded-[2rem] border border-white/5 space-y-6 text-left text-white">
                              <h4 className="font-black text-sm uppercase tracking-widest text-primary">Format & Chrono Sync</h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                  <Label className="text-[9px] font-black uppercase text-white/40 ml-1">Tournament Format</Label>
                                  {isStarter ? (
                                    <div className="h-12 rounded-xl bg-white/5 border border-white/10 px-4 flex items-center justify-between text-xs font-bold uppercase">
                                      <span>Basic (Round Robin)</span>
                                      <span className="flex items-center gap-1 text-[8px] font-black uppercase text-white/30"><Lock className="h-2.5 w-2.5" /> Pro Locked</span>
                                    </div>
                                  ) : (
                                    <Select 
                                      value={activeConfig.tournamentType} 
                                      onValueChange={(val: any) => {
                                        let newGames = activeConfig.gamesPerTeam;
                                        if (val === 'single_elimination') newGames = '1';
                                        if (val === 'double_elimination') newGames = '2';
                                        updateActiveConfig({
                                          tournamentType: val,
                                          gamesPerTeam: newGames,
                                          poolCount: activeConfig.poolCount || '2',
                                          advancePerPool: activeConfig.advancePerPool || '2',
                                        });
                                      }}
                                    >
                                      <SelectTrigger className="bg-white/5 border-white/15 h-12 rounded-xl text-white font-bold uppercase text-[10px] focus:ring-primary">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent className="bg-black border-white/10 text-white font-black uppercase text-[10px]">
                                        <SelectItem value="round_robin" className="focus:bg-white/10">Round Robin (Total Points)</SelectItem>
                                        <SelectItem value="pool_play_knockout" className="focus:bg-white/10">Pool Play & Playoffs</SelectItem>
                                        <SelectItem value="single_elimination" className="focus:bg-white/10">Single Elimination Matrix</SelectItem>
                                        <SelectItem value="double_elimination" className="focus:bg-white/10">Double Elimination Topology</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  )}
                                </div>

                                <div className="space-y-2">
                                  <Label className="text-[9px] font-black uppercase text-white/40 ml-1">Match Duration (Min)</Label>
                                  <Input 
                                    type="number" 
                                    min={1}
                                    step={1}
                                    value={activeConfig.gameLength} 
                                    onChange={e => updateActiveConfig({ gameLength: e.target.value })} 
                                    className="h-12 bg-white/5 border-white/15 rounded-xl text-white font-bold" 
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label className="text-[9px] font-black uppercase text-white/40 ml-1">Rest / Turnaround (Min)</Label>
                                  <Input 
                                    type="number" 
                                    min={0}
                                    step={1}
                                    value={activeConfig.breakLength} 
                                    onChange={e => updateActiveConfig({ breakLength: e.target.value })} 
                                    className="h-12 bg-white/5 border-white/15 rounded-xl text-white font-bold" 
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label className="text-[9px] font-black uppercase text-white/40 ml-1">Min Games Per Squad</Label>
                                  <Input 
                                    type="number" 
                                    min={1}
                                    step={1}
                                    value={activeConfig.gamesPerTeam} 
                                    onChange={e => updateActiveConfig({ gamesPerTeam: e.target.value })} 
                                    disabled={activeConfig.tournamentType === 'single_elimination' || activeConfig.tournamentType === 'double_elimination'} 
                                    className="h-12 bg-white/5 border-white/15 rounded-xl text-white font-bold" 
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-[9px] font-black uppercase text-white/40 ml-1">Max Games / Squad / Day</Label>
                                  <Input
                                    type="number"
                                    min={1}
                                    step={1}
                                    value={activeConfig.maxDailyGamesPerTeam}
                                    onChange={e => updateActiveConfig({ maxDailyGamesPerTeam: e.target.value })}
                                    className="h-12 bg-white/5 border-white/15 rounded-xl text-white font-bold"
                                  />
                                </div>
                                {activeConfig.tournamentType === 'pool_play_knockout' && (
                                  <>
                                    <div className="space-y-2">
                                      <Label className="text-[9px] font-black uppercase text-white/40 ml-1">Number of Pools</Label>
                                      <Input
                                        type="number"
                                        min={2}
                                        step={1}
                                        value={activeConfig.poolCount}
                                        onChange={e => updateActiveConfig({ poolCount: e.target.value })}
                                        className="h-12 bg-white/5 border-white/15 rounded-xl text-white font-bold"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label className="text-[9px] font-black uppercase text-white/40 ml-1">Advance Per Pool</Label>
                                      <Input
                                        type="number"
                                        min={1}
                                        step={1}
                                        value={activeConfig.advancePerPool}
                                        onChange={e => updateActiveConfig({ advancePerPool: e.target.value })}
                                        className="h-12 bg-white/5 border-white/15 rounded-xl text-white font-bold"
                                      />
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Card 2: Venue & Field Allocation */}
                            <div className="bg-[#0a0a0a] p-8 rounded-[2rem] border border-white/5 space-y-6 text-left text-white">
                              <div className="flex items-center justify-between">
                                <h4 className="font-black text-sm uppercase tracking-widest text-primary">Venue & Field Allocation</h4>
                                <div className="flex border border-white/10 rounded-xl overflow-hidden">
                                  <button
                                    type="button"
                                    onClick={() => updateActiveConfig({ venueType: 'club' })}
                                    className={cn(
                                      "px-4 py-2 text-[9px] font-black uppercase transition-colors",
                                      activeConfig.venueType === 'club' ? "bg-white text-black" : "bg-white/5 text-white/60 hover:bg-white/10"
                                    )}
                                  >
                                    Club Facility
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateActiveConfig({ venueType: 'custom' })}
                                    className={cn(
                                      "px-4 py-2 text-[9px] font-black uppercase transition-colors",
                                      activeConfig.venueType === 'custom' ? "bg-white text-black" : "bg-white/5 text-white/60 hover:bg-white/10"
                                    )}
                                  >
                                    Custom Venue
                                  </button>
                                </div>
                              </div>

                              {activeConfig.venueType === 'club' ? (
                                <div className="space-y-4">
                                  <div className="space-y-2">
                                    <Label className="text-[9px] font-black uppercase text-white/40 ml-1">Select Account Facility</Label>
                                    <Select 
                                      value={activeConfig.selectedFacilityId} 
                                      onValueChange={(val) => {
                                        updateActiveConfig({ selectedFacilityId: val, allocatedFields: [] });
                                      }}
                                    >
                                      <SelectTrigger className="bg-white/5 border-white/15 h-12 rounded-xl text-white font-bold uppercase text-[10px] focus:ring-primary">
                                        <SelectValue placeholder="Choose Facility..." />
                                      </SelectTrigger>
                                      <SelectContent className="bg-black border-white/10 text-white font-black uppercase text-[10px]">
                                        {facilities?.map(fac => (
                                          <SelectItem key={fac.id} value={fac.id} className="focus:bg-white/10">
                                            {fac.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  {activeConfig.selectedFacilityId && (
                                    <div className="space-y-2 pt-2">
                                      <Label className="text-[9px] font-black uppercase text-white/40 ml-1">Allocate Specific Fields</Label>
                                      <FacilityFieldLoader 
                                        facilityId={activeConfig.selectedFacilityId} 
                                        selectedFields={activeConfig.allocatedFields} 
                                        onToggleField={(fieldIdentifier) => {
                                          const prev = activeConfig.allocatedFields || [];
                                          const nextFields = prev.includes(fieldIdentifier)
                                            ? prev.filter(f => f !== fieldIdentifier)
                                            : [...prev, fieldIdentifier];
                                          updateActiveConfig({ allocatedFields: nextFields });
                                        }} 
                                      />
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  <div className="space-y-2">
                                    <Label className="text-[9px] font-black uppercase text-white/40 ml-1">Custom Venue / Stadium Name</Label>
                                    <Input 
                                      value={activeConfig.customVenueName} 
                                      onChange={e => updateActiveConfig({ customVenueName: e.target.value })} 
                                      placeholder="e.g. Central Park Sports Complex" 
                                      className="h-12 bg-white/5 border-white/15 rounded-xl text-white font-bold" 
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-[9px] font-black uppercase text-white/40 ml-1">Field Names (Comma-separated)</Label>
                                    <Input 
                                      value={activeConfig.customFieldsText} 
                                      onChange={e => updateActiveConfig({ customFieldsText: e.target.value })} 
                                      placeholder="e.g. Field 1, Field 2, Field 3" 
                                      className="h-12 bg-white/5 border-white/15 rounded-xl text-white font-bold" 
                                    />
                                    <p className="text-[8px] font-bold text-white/20 uppercase tracking-wider pl-1">
                                      Separate multiple fields with commas. The scheduler will distribute matches across these fields.
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Card 3: Daily Operational Windows */}
                          <div className="bg-[#0a0a0a] p-8 rounded-[2rem] border border-white/5 space-y-6 text-left text-white">
                            <div className="flex items-center justify-between">
                              <h4 className="font-black text-sm uppercase tracking-widest text-primary">Daily Operational Windows</h4>
                              {(!activeConfig.dailyWindows || activeConfig.dailyWindows.length === 0) && (
                                <Button 
                                  type="button" 
                                  onClick={generateDailyWindowsForActive} 
                                  variant="outline" 
                                  className="h-9 px-4 rounded-xl border-white/20 text-white hover:bg-white/10 font-black uppercase text-[9px] tracking-widest"
                                >
                                  Auto-Generate Days
                                </Button>
                              )}
                            </div>

                            {activeConfig.dailyWindows && activeConfig.dailyWindows.length > 0 ? (
                              <div className="grid gap-4">
                                {activeConfig.dailyWindows.map((win, idx) => (
                                  <div key={win.date} className="bg-white/5 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between border border-white/5 gap-4">
                                    <div className="flex items-center gap-3">
                                      <CalendarIcon className="h-4 w-4 text-white/30" />
                                      <span className="font-black uppercase tracking-widest text-xs">
                                        {(() => {
                                          try {
                                            const [y, m, d] = win.date.split('-').map(Number);
                                            return format(new Date(y, m - 1, d, 12, 0, 0), 'EEEE, MMMM d, yyyy');
                                          } catch {
                                            return win.date;
                                          }
                                        })()}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <Input 
                                        type="time" 
                                        value={win.startTime} 
                                        onChange={e => {
                                          const n = [...activeConfig.dailyWindows];
                                          n[idx].startTime = e.target.value;
                                          updateActiveConfig({ dailyWindows: n });
                                        }} 
                                        style={{ colorScheme: 'dark' }} 
                                        className="h-10 w-28 bg-white/5 border-white/10 font-bold text-white text-xs bg-black" 
                                      />
                                      <span className="opacity-30">&rarr;</span>
                                      <Input 
                                        type="time" 
                                        value={win.endTime} 
                                        onChange={e => {
                                          const n = [...activeConfig.dailyWindows];
                                          n[idx].endTime = e.target.value;
                                          updateActiveConfig({ dailyWindows: n });
                                        }} 
                                        style={{ colorScheme: 'dark' }} 
                                        className="h-10 w-28 bg-white/5 border-white/10 font-bold text-white text-xs bg-black" 
                                      />
                                      <Button 
                                        type="button" 
                                        variant="ghost" 
                                        onClick={() => {
                                          const n = activeConfig.dailyWindows.filter(w => w.date !== win.date);
                                          updateActiveConfig({ dailyWindows: n });
                                        }}
                                        className="h-10 w-10 p-0 text-white/20 hover:text-red-500 hover:bg-red-500/10 rounded-xl"
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="py-12 border-2 border-dashed border-white/5 rounded-2xl text-center text-white/30 font-black uppercase text-xs tracking-widest">
                                No operational windows configured. Click "Auto-Generate Days" to populate based on dates.
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {step === 4 && (
                  <div className="space-y-12 animate-in slide-in-from-right-4 duration-500">
                    <div className="text-center">
                      <div className="w-24 h-24 rounded-full bg-primary/20 text-primary flex items-center justify-center mx-auto mb-6 shadow-[0_0_50px_rgba(var(--primary),0.3)]">
                                  <Database className="h-12 w-12" />
                      </div>
                      <Badge className="bg-primary text-white border-none uppercase font-black tracking-widest text-[10px] px-6 h-8 mb-6">System Lock Achieved</Badge>
                      <h3 className="text-5xl lg:text-7xl font-black uppercase tracking-tighter mb-4 text-white leading-none">Execute<br/>Deployment</h3>
                      <p className="text-sm font-bold opacity-60 uppercase tracking-widest max-w-md mx-auto">Schedules are dynamically calculated via our algorithmic constraints engine. Proceeding initiates telemetry rendering.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                       <div className="bg-[#0a0a0a] p-8 rounded-[3rem] border border-white/5 text-center flex flex-col items-center justify-center">
                         <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-2">Engaged Squads</span>
                         <span className="text-5xl font-black text-white">{form.teams.length}</span>
                       </div>
                       <div className="bg-[#0a0a0a] p-8 rounded-[3rem] border border-white/5 text-center flex flex-col items-center justify-center relative overflow-hidden">
                         <div className="absolute inset-0 bg-primary/5" />
                         <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-2 relative z-10">Algorithmic Match Load</span>
                         <span className="text-5xl font-black text-white relative z-10 drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">±{Math.max(1, form.teams.length * (parseInt(form.gamesPerTeam)/2))}</span>
                       </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
            
            <div className="p-8 border-t border-white/10 bg-[#070707] flex justify-between items-center shrink-0">
               {step > 1 ? (
                 <Button variant="ghost" onClick={() => setStep(step - 1)} className="h-16 px-10 rounded-2xl font-black uppercase text-xs tracking-widest text-white/50 hover:text-white hover:bg-white/5">
                   <ChevronLeft className="h-4 w-4 mr-2" /> Rollback
                 </Button>
               ) : <div />}
               
               <Button onClick={step === 4 ? handleDeploy : handleNext} disabled={isProcessing} className="h-16 px-14 rounded-2xl bg-white text-black hover:bg-white/90 font-black uppercase text-sm tracking-widest shadow-[0_0_30px_rgba(255,255,255,0.1)] transition-all flex items-center">
                 {isProcessing ? (
                   <><Loader2 className="mr-3 h-5 w-5 animate-spin" /> SYNCHRONIZING</>
                 ) : step === 4 ? (
                   <><Target className="mr-3 h-5 w-5 text-red-600" /> INITIALIZE TOURNAMENT</>
                 ) : (
                   <>Proceed to Phase {step + 1} <ArrowRight className="ml-3 h-5 w-5" /></>
                 )}
               </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TournamentEditDialog({ event, isOpen, onOpenChange }: { event: TeamEvent, isOpen: boolean, onOpenChange: (o: boolean) => void }) {
  const { activeTeam, db } = useTeam();
  const firebaseAuth = useAuth();
  const [isSaving, setIsSaving] = useState(false);

  const handleArchive = async () => {
    if(!db || !activeTeam) return;
    if(!window.confirm("Authorize Archival Protocol? This series will be moved to historical datastores.")) return;
    setIsSaving(true);
    try {
      const token = await getAuthToken(firebaseAuth);
      if (!token) throw new Error('Your session has expired. Sign in again.');
      const response = await fetch('/api/tournaments/schedule', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify({ teamId: activeTeam.id, eventId: event.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to archive this tournament.');
      onOpenChange(false);
      window.location.reload(); // Refresh to clear selected state
      toast({ title: "Series Decommissioned", description: "Tournament moved to historical archives." });
    } catch(e: any) {
      toast({ title: "Archival Failed", description: e?.message, variant: "destructive" });
    }
    setIsSaving(false);
  };

  return (
    <TournamentDeploymentWizard 
      editEvent={event} 
      isOpen={isOpen} 
      onOpenChange={onOpenChange} 
      onComplete={() => {
        // Since we are editing an active event, we might need to refresh local state if not auto-synced
        onOpenChange(false);
      }}
    />
  );
}

function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const [year, month, day] = cleanDate.split('-').map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return new Date();
  return new Date(year, month - 1, day);
}

function TournamentDetailView({ 
  event, 
  onBack, 
  allEvents = [], 
  onSelectEvent 
}: { 
  event: TeamEvent, 
  onBack: () => void, 
  allEvents?: TeamEvent[], 
  onSelectEvent?: (id: string) => void 
}) {
  const { isStaff: isTeamStaff, activeTeam, db, user, isStarter } = useTeam();
  const firebaseAuth = useAuth();
  const isStaff = isTeamStaff || !!(event.adminEmails && user?.email && event.adminEmails.includes(user.email));
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('itinerary');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [scoreDialogOpen, setScoreDialogOpen] = useState(false);
  const [selectedGame, setSelectedGame] = useState<TournamentGame | null>(null);
  const [celebrationWinner, setCelebrationWinner] = useState<string | null>(null);
  const [logoEditState, setLogoEditState] = useState<{ idx: number; name: string; url: string } | null>(null);
  const [isOptimizingLogo, setIsOptimizingLogo] = useState(false);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [deploymentError, setDeploymentError] = useState('');

  const handleDeleteTournament = async () => {
    if (!activeTeam || isProcessing) return;
    if (!window.confirm(`Delete ${event.title}${event.divisionTitle ? ` - ${event.divisionTitle}` : ''}? This permanently removes the tournament, schedule, registrations, and portal access.`)) return;
    setIsProcessing(true);
    try {
      const token = await getAuthToken(firebaseAuth);
      if (!token) throw new Error('Your session has expired. Sign in again.');
      const response = await fetch('/api/tournaments/schedule', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify({ action: 'delete', teamId: activeTeam.id, eventId: event.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to delete this tournament.');
      toast({ title: 'Tournament Deleted', description: `${event.title} was permanently removed.` });
      onBack();
    } catch (error) {
      toast({
        title: 'Delete Failed',
        description: error instanceof Error ? error.message : 'Unable to delete this tournament.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Queries for logistics editor
  const facilitiesQuery = useMemoFirebase(() => {
    if (!db || !user?.id) return null;
    return query(collection(db, 'facilities'), where('clubId', '==', user.id));
  }, [db, user?.id]);
  const { data: facilities } = useCollection<Facility>(facilitiesQuery);

  const siblingEvents = useMemo(() => {
    if (!allEvents || !event) return [];
    return allEvents.filter(e => e.title.toLowerCase() === event.title.toLowerCase() && !e.isArchived);
  }, [allEvents, event]);

  // Local state for division-level logistics editor
  const [logisticsType, setLogisticsType] = useState<'round_robin' | 'single_elimination' | 'double_elimination' | 'pool_play_knockout'>('round_robin');
  const [logisticsGameLength, setLogisticsGameLength] = useState('60');
  const [logisticsBreakLength, setLogisticsBreakLength] = useState('15');
  const [logisticsGamesPerTeam, setLogisticsGamesPerTeam] = useState('3');
  const [logisticsDailyWindows, setLogisticsDailyWindows] = useState<DailyWindow[]>([]);
  const [venueType, setVenueType] = useState<'club' | 'custom'>('club');
  const [selectedFacilityId, setSelectedFacilityId] = useState('');
  const [allocatedFields, setAllocatedFields] = useState<string[]>([]);
  const [customVenueName, setCustomVenueName] = useState('');
  const [customFieldsText, setCustomFieldsText] = useState('');

  useEffect(() => {
    if (event) {
      setLogisticsType((event.tournamentType as any) || 'round_robin');
      setLogisticsGameLength(event.gameLength?.toString() || '60');
      setLogisticsBreakLength(event.breakLength?.toString() || '15');
      setLogisticsGamesPerTeam(event.gamesPerTeam?.toString() || '3');
      setLogisticsDailyWindows(event.dailyWindows || []);
      
      const isCustom = !!event.manualVenue;
      setVenueType(isCustom ? 'custom' : 'club');
      setCustomVenueName(event.manualVenue || event.location || '');
      
      if (isCustom) {
        setAllocatedFields([]);
        setSelectedFacilityId('');
        setCustomFieldsText((event.selectedFields || []).join(', '));
      } else {
        setCustomFieldsText('');
        const fields = event.selectedFields || [];
        setAllocatedFields(fields);
        const firstFieldFacId = fields[0]?.split(':')?.[0] || '';
        setSelectedFacilityId(firstFieldFacId);
      }
    }
  }, [event]);

  const generateDailyWindowsFromDates = () => {
    if (!event.date) return;
    try {
      const startD = parseLocalDate(event.date);
      const endD = event.endDate ? parseLocalDate(event.endDate) : startD;
      const days = eachDayOfInterval({ start: startD, end: endD });
      setLogisticsDailyWindows(days.map(d => ({
        date: format(d, 'yyyy-MM-dd'),
        startTime: '08:00',
        endTime: '20:00'
      })));
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddTeamDirectly = async (name: string, coach: string, email: string) => {
    if (!db || !activeTeam || !firebaseAuth) return;
    if (!name.trim()) {
      toast({ title: "Name Required", description: "Please enter a team name.", variant: "destructive" });
      return;
    }
    const newTeam: TournamentTeam = {
      id: `m_${Date.now()}`,
      name: name.trim(),
      coach: coach.trim() || 'Head Coach Unassigned',
      email: email.trim(),
      source: 'manual' as const,
      division: event.divisionTitle || ''
    };
    const updatedTeams = [...(event.tournamentTeamsData || []), newTeam];
    try {
      if ((event.tournamentGames || []).length > 0) {
        const token = await getAuthToken(firebaseAuth);
        if (!token) throw new Error('Your session has expired. Sign in again.');
        const response = await fetch('/api/tournaments/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader(token) },
          body: JSON.stringify({ action: 'clear', teamId: activeTeam.id, eventId: event.id }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Unable to invalidate the published schedule.');
      }
      await updateDoc(doc(db, 'teams', activeTeam.id, 'events', event.id), {
        tournamentTeamsData: updatedTeams,
        tournamentTeams: updatedTeams.map(t => t.name)
      });
      toast({ title: "Team Added", description: `${name} has been enrolled in this division.` });
    } catch (err: any) {
      toast({ title: "Failed to Add Team", description: err.message, variant: "destructive" });
    }
  };

  const handleRemoveTeamDirectly = async (teamId: string, teamName: string) => {
    if (!db || !activeTeam || !firebaseAuth) return;
    if (!window.confirm(`Are you sure you want to remove ${teamName} from this tournament division?`)) return;
    const updatedTeams = (event.tournamentTeamsData || []).filter((t: any) => t.id !== teamId);
    try {
      if ((event.tournamentGames || []).length > 0) {
        const token = await getAuthToken(firebaseAuth);
        if (!token) throw new Error('Your session has expired. Sign in again.');
        const response = await fetch('/api/tournaments/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader(token) },
          body: JSON.stringify({ action: 'clear', teamId: activeTeam.id, eventId: event.id }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Unable to invalidate the published schedule.');
      }
      await updateDoc(doc(db, 'teams', activeTeam.id, 'events', event.id), {
        tournamentTeamsData: updatedTeams,
        tournamentTeams: updatedTeams.map(t => t.name)
      });
      toast({ title: "Team Removed", description: `${teamName} has been removed.` });
    } catch (err: any) {
      toast({ title: "Failed to Remove Team", description: err.message, variant: "destructive" });
    }
  };

  const handleGenerateSchedule = async () => {
    if (!db || !activeTeam) return;

    if (!event.tournamentTeamsData || event.tournamentTeamsData.length < 2) {
      toast({
        title: "Schedule Generation Failed",
        description: "You must have at least 2 teams to generate a schedule.",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    setDeploymentError('');
    try {
      const uniqueFieldIds = (event.selectedFields || []).filter((fieldId: string, index: number, fields: string[]) =>
        fields.findIndex(candidate => candidate.toLowerCase() === fieldId.toLowerCase()) === index
      );
      const mappedFields = uniqueFieldIds.map((fId: string) => {
        if (fId.includes(':')) {
          const facId = fId.slice(0, fId.indexOf(':'));
          const fieldName = getFacilityFieldName(fId);
          const facility = facilities?.find(fac => fac.id === facId);
          return {
            id: fId,
            name: facility ? `${facility.name} - ${fieldName}` : fieldName,
          };
        }
        const venueKey = (event.manualVenue || event.location || 'custom').trim().toLowerCase();
        return {
          id: `custom:${venueKey}:${fId.trim().toLowerCase()}`,
          name: fId,
        };
      });

      const config = {
        teams: event.tournamentTeamsData || [],
        fields: mappedFields,
        startDate: event.date ? new Date(event.date).toISOString().split('T')[0] : '',
        endDate: event.endDate ? new Date(event.endDate).toISOString().split('T')[0] : '',
        startTime: '08:00',
        endTime: '20:00',
        gameLength: event.gameLength || 60,
        breakLength: event.breakLength || 15,
        gamesPerTeam: event.gamesPerTeam || 3,
        maxDailyGamesPerTeam: event.maxDailyGamesPerTeam || 3,
        tournamentType: event.tournamentType || 'round_robin',
        dailyWindows: event.dailyWindows || [],
        poolCount: (event as any).poolCount || 2,
        advancePerPool: (event as any).advancePerPool || 2,
      };

      const { games, report } = generateIntelligentTournamentSchedule(config);

      if (!report.isValid || games.length === 0) {
        throw new Error(report.conflicts[0] || "No games could be generated. Check your date range, daily windows, and fields constraints.");
      }

      const sanitizedGames = games.map(g => {
        const cleaned: any = {};
        Object.entries(g).forEach(([k, v]) => {
          if (v !== undefined) cleaned[k] = v;
        });
        return cleaned as TournamentGame;
      });

      const token = await getAuthToken(firebaseAuth);
      if (!token) throw new Error('Your session has expired. Sign in again.');
      const response = await fetch('/api/tournaments/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify({
          teamId: activeTeam.id,
          eventId: event.id,
          games: sanitizedGames,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = Array.isArray(payload.conflicts) && payload.conflicts.length > 0
          ? ` ${payload.conflicts[0]}`
          : '';
        throw new Error(`${payload.error || 'Unable to deploy the tournament schedule.'}${detail}`);
      }

      toast({
        title: "Tournament Deployed",
        description: `Schedule and bracket are ready with ${sanitizedGames.length} matches.`
      });
    } catch (e: any) {
      console.error("[Tournaments] Schedule generation failed:", e);
      const message = e.message || "An error occurred during schedule generation.";
      setDeploymentError(message);
      try {
        await updateDoc(doc(db, 'teams', activeTeam.id, 'events', event.id), {
          bracketStatus: 'failed', scheduleStatus: 'failed', deploymentStatus: 'failed', deploymentError: message,
        });
      } catch (statusError) {
        console.error('[Tournaments] Failed to persist deployment failure state:', statusError);
      }
      toast({
        title: "Generation Failed",
        description: message,
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSyncLogos = async () => {
    if (!db || !activeTeam || !event.tournamentTeamsData) return;
    setIsProcessing(true);
    try {
      const updatedTeamsData = [...event.tournamentTeamsData];
      let changes = 0;
      
      for (let i = 0; i < updatedTeamsData.length; i++) {
        const team = updatedTeamsData[i];
        if (team.id && !team.id.startsWith('p_') && !team.id.startsWith('l_')) {
          const teamDoc = await getDoc(doc(db, 'teams', team.id));
          if (teamDoc.exists()) {
            const teamData = teamDoc.data();
            if (teamData.logoUrl && teamData.logoUrl !== team.logoUrl) {
              updatedTeamsData[i] = { ...team, logoUrl: teamData.logoUrl };
              changes++;
            }
          }
        }
      }
      
      if (changes > 0) {
        await updateDoc(doc(db, 'teams', activeTeam.id, 'events', event.id), {
          tournamentTeamsData: updatedTeamsData
        });
        toast({ title: "LOGOS_SYNCED", description: `${changes} team logos have been updated to match their official profiles.` });
      } else {
        toast({ title: "LOGOS_CURRENT", description: "All team logos are already up to date." });
      }
    } catch (error) {
      console.error("Sync error:", error);
      toast({ title: "SYNC_ERROR", description: "Failed to synchronize logos.", variant: "destructive" });
    }
    setIsProcessing(false);
  };

  const handleSaveTeamLogo = async () => {
    if (!logoEditState || !db || !activeTeam) return;
    const updated = (event.tournamentTeamsData || []).map((t: any, i: number) =>
      i === logoEditState.idx ? { ...t, logoUrl: logoEditState.url } : t
    );
    await updateDoc(doc(db, 'teams', activeTeam.id, 'events', event.id), { tournamentTeamsData: updated });
    toast({ title: 'Logo Updated', description: `Logo set for ${logoEditState.name}.` });
    setLogoEditState(null);
  };

  const handleTeamLogoFile = async (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast({
        title: 'Unsupported Image',
        description: 'Choose a JPG, PNG, or WEBP image.',
        variant: 'destructive',
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'Image Too Large',
        description: 'Choose an image smaller than 10 MB.',
        variant: 'destructive',
      });
      return;
    }

    setIsOptimizingLogo(true);
    try {
      const raw = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Unable to read image.'));
        reader.readAsDataURL(file);
      });
      const optimized = await compressImage(raw, 480, 480, 0.78);
      setLogoEditState(current => current ? { ...current, url: optimized } : null);
      toast({ title: 'Logo Optimized', description: 'The image is ready to save.' });
    } catch (error) {
      console.error('[Tournament] Logo optimization failed:', error);
      toast({
        title: 'Image Processing Failed',
        description: 'The logo could not be optimized. Please try another image.',
        variant: 'destructive',
      });
    } finally {
      setIsOptimizingLogo(false);
      if (logoFileInputRef.current) logoFileInputRef.current.value = '';
    }
  };

  // ── Referee Management ──────────────────────────────────────────────────
  const [newRefName, setNewRefName] = useState('');
  const [newRefEmail, setNewRefEmail] = useState('');
  const [newRefPhone, setNewRefPhone] = useState('');
  const [newRefCert, setNewRefCert] = useState('');
  const [isSavingRef, setIsSavingRef] = useState(false);

  const handleAddReferee = async () => {
    if (!db || !activeTeam || !newRefName.trim() || !newRefEmail.trim()) return;
    setIsSavingRef(true);
    const referee: TournamentReferee = {
      id: `ref_${Date.now()}`,
      name: newRefName.trim(),
      email: newRefEmail.trim().toLowerCase(),
      phone: newRefPhone.trim() || null,
      certLevel: newRefCert.trim() || null,
    };
    try {
      await updateDoc(doc(db, 'teams', activeTeam.id, 'events', event.id), {
        refereePool: [...(event.refereePool || []), referee],
      });
      toast({ title: 'Official Added', description: `${referee.name} added to the pool.` });
      setNewRefName(''); setNewRefEmail(''); setNewRefPhone(''); setNewRefCert('');
    } finally { setIsSavingRef(false); }
  };

  const handleRemoveReferee = async (refId: string) => {
    if (!db || !activeTeam || !firebaseAuth) return;
    const token = await getAuthToken(firebaseAuth);
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const response = await fetch('/api/tournaments/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({ action: 'clear-referee', teamId: activeTeam.id, eventId: event.id, refereeId: refId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Unable to clear referee assignments.');
    await updateDoc(doc(db, 'teams', activeTeam.id, 'events', event.id), {
      refereePool: (event.refereePool || []).filter((r: TournamentReferee) => r.id !== refId),
    });
    toast({ title: 'Official Removed', description: 'Referee and all assignments cleared.' });
  };

  const handleAssignReferee = async (gameId: string, referee: TournamentReferee | null) => {
    if (!db || !activeTeam) return;
    const targetGame = (event.tournamentGames || []).find((g: TournamentGame) => g.id === gameId);
    if (!targetGame) return;
    if (referee) {
      const conflict = findRefereeConflict(
        referee.id, targetGame,
        (event.tournamentGames || []).filter((g: TournamentGame) => g.id !== gameId)
      );
      if (conflict) {
        toast({
          title: 'Scheduling Conflict',
          description: `${referee.name} is already assigned to ${conflict.team1} vs ${conflict.team2} within 90 min.`,
          variant: 'destructive',
        });
        return;
      }
    }
    if (!firebaseAuth) return;
    const token = await getAuthToken(firebaseAuth);
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const response = await fetch('/api/tournaments/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({
        action: 'assign-referee',
        teamId: activeTeam.id,
        eventId: event.id,
        gameId,
        refereeId: referee?.id || '',
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Unable to update the referee assignment.');
    toast({ title: 'Assignment Updated', description: referee ? `${referee.name} assigned.` : 'Official unassigned.' });
  };

  const handleGameClick = (game: TournamentGame) => {
    if (!isStaff || game.team1.includes('TBD') || game.team2.includes('TBD')) return;
    setSelectedGame(game);
    setScoreDialogOpen(true);
  };

  // Shorten verbose scheduler round names for the match card badge
  const formatRoundBadge = (round: string): string => {
    const r = round.trim();
    const map: Record<string, string> = {
      'Winners Bracket Final':       'WB Final',
      'Winners Bracket Semi-Finals': 'WB Semis',
      'Losers Bracket Final':        'LB Final',
      // Championship Decider is only played if LB winner defeats undefeated WB champ
      'Championship Decider':        'If Needed',
    };
    if (map[r]) return map[r];
    // "WB Round 1" → "WB R1", "LB Round 3" → "LB R3" for compact display
    const wbM = r.match(/^WB Round (\d+)$/i);
    if (wbM) return `WB R${wbM[1]}`;
    const lbM = r.match(/^LB Round (\d+)$/i);
    if (lbM) return `LB R${lbM[1]}`;
    return r;
  };

  const gamesByDay = useMemo(() => {
    if (!event.tournamentGames) return {};

    // Exclude conditional "Championship Decider" (If Needed) from the schedule view.
    // It only appears in the bracket renderer when actually triggered.
    const scheduledGames = event.tournamentGames.filter((g: TournamentGame) => !(g as any).isConditional);

    // Parse "8:00 AM" / "2:30 PM" → total minutes from midnight for reliable sort
    const parseTimeMinutes = (t: string): number => {
      if (!t || t === 'TBA') return 9999;
      const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!m) return 9999;
      let h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      const ampm = m[3].toUpperCase();
      if (ampm === 'PM' && h !== 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      return h * 60 + min;
    };

    // Bracket tier — only used as secondary tiebreaker for same-time games
    const bracketTier = (round: string): number => {
      const r = (round || '').toLowerCase();
      if (r.includes('championship') || r.includes('grand final')) return 90;
      if (r === 'winners bracket final' || r === 'losers bracket final') return 80;
      if (r.includes('winners bracket semi')) return 70;
      const lb = r.match(/lb round\s+(\d+)/);
      if (lb) return 40 + parseInt(lb[1], 10);
      const wb = r.match(/wb round\s+(\d+)/);
      if (wb) return 10 + parseInt(wb[1], 10);
      const generic = r.match(/round\s+(\d+)/);
      if (generic) return 10 + parseInt(generic[1], 10);
      return 50;
    };

    const grouped = scheduledGames.reduce((acc: any, game: TournamentGame) => {
      const day = game.date;
      if (!acc[day]) acc[day] = [];
      acc[day].push(game);
      return acc;
    }, {});

    return Object.fromEntries(
      Object.entries(grouped)
        .sort(([a], [b]) => a.localeCompare(b))          // days in chronological order
        .map(([day, games]: [string, any]) => [
          day,
          [...games].sort((a: any, b: any) => {
            // Primary: scheduled time (earliest first)
            const timeDiff = parseTimeMinutes(a.time) - parseTimeMinutes(b.time);
            if (timeDiff !== 0) return timeDiff;
            // Secondary: bracket stage (WB before LB before Finals)
            const tierDiff = bracketTier(a.round) - bracketTier(b.round);
            if (tierDiff !== 0) return tierDiff;
            // Tertiary: round name alphabetically
            return (a.round || '').localeCompare(b.round || '');
          })
        ])
    );
  }, [event.tournamentGames]);
  
  const standings = useMemo(() => calculateTournamentStandings(event.tournamentTeamsData || [], event.tournamentGames || []), [event]);

  // MISS-4: Per-pool standings for pool_play_knockout — computed per pool index
  const poolStandings = useMemo(() => {
    const games = event.tournamentGames || [];
    const poolIndices = [...new Set(games.filter(g => (g as any).pool !== undefined).map(g => (g as any).pool as number))].sort();
    if (poolIndices.length === 0) return null;
    return poolIndices.map(poolIdx => ({
      label: String.fromCharCode(65 + poolIdx), // A, B, C...
      rows: calculateTournamentStandings(event.tournamentTeamsData || [], games, poolIdx)
    }));
  }, [event]);

  const seedBracketFromStandings = async () => {
    if (!db || !activeTeam || !event.tournamentGames) return;
    if (event.tournamentType !== 'pool_play_knockout' || !poolStandings) {
      toast({ title: "Pool Qualification Only", description: "Standings seeding is available only for pool-play tournaments.", variant: "destructive" });
      return;
    }
    const poolGames = event.tournamentGames.filter(game => (game as any).pool !== undefined);
    if (poolGames.length === 0 || poolGames.some(game => !game.isCompleted)) {
      toast({ title: "Pool Play Incomplete", description: "Every pool match must have a final score before qualifiers can be seeded.", variant: "destructive" });
      return;
    }
    const expectedPools = (event as any).poolCount || poolStandings.length;
    const advancePerPool = (event as any).advancePerPool || 2;
    if (poolStandings.length !== expectedPools || poolStandings.some(pool => pool.rows.length < advancePerPool)) {
      toast({ title: "Qualification Mismatch", description: "The completed pools do not match the configured qualifier count.", variant: "destructive" });
      return;
    }

    const qualifiers = new Map<string, any>();
    poolStandings.forEach(pool => {
      pool.rows.slice(0, advancePerPool).forEach((team: any, index: number) => {
        qualifiers.set(`${pool.label}:${index + 1}`, team);
      });
    });

    let seededSlots = 0;
    const updatedGames = event.tournamentGames.map(game => {
      if (game.stage !== 'Knockout') return game;
      const update: Partial<TournamentGame> = {};
      (['team1', 'team2'] as const).forEach(slot => {
        const label = game[slot] || '';
        const match = label.match(/Pool ([A-Z])\s*-\s*(\d+)(?:st|nd|rd|th)/i);
        if (!match) return;
        const qualifier = qualifiers.get(`${match[1].toUpperCase()}:${Number(match[2])}`);
        if (!qualifier) return;
        update[slot] = qualifier.name;
        update[`${slot}Id` as 'team1Id' | 'team2Id'] = qualifier.id;
        update[`${slot}LogoUrl` as 'team1LogoUrl' | 'team2LogoUrl'] = event.tournamentTeamsData?.find(team => team.id === qualifier.id)?.logoUrl;
        seededSlots++;
      });
      return Object.keys(update).length > 0 ? { ...game, ...update } : game;
    });
    if (seededSlots === 0) {
      toast({ title: "Architectural Mismatch", description: "No pool qualifier placeholders were found in the knockout bracket.", variant: "destructive" });
      return;
    }

    if (!firebaseAuth) return;
    const token = await getAuthToken(firebaseAuth);
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const response = await fetch('/api/tournaments/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({ action: 'seed-pools', teamId: activeTeam.id, eventId: event.id }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Unable to seed the knockout bracket.');
    toast({ title: "Bracket Initialized", description: `${seededSlots} pool qualifier slots were populated from completed standings.` });
  };

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-500 text-black">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 text-left">
        <div className="flex min-w-0 items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full h-12 w-12 border-2 hover:bg-muted shrink-0 text-black border-black"><ChevronLeft className="h-6 w-6" /></Button>
          <div className="min-w-0 bg-primary/5 px-4 py-2 rounded-xl text-primary font-black uppercase text-[10px] tracking-widest border border-primary/10 flex items-center gap-1.5">
            <span className="break-words">Active Context: {event.title}</span>
            {event.divisionTitle && (
              <span className="text-muted-foreground/80">• {event.divisionTitle}</span>
            )}
          </div>
        </div>

        {siblingEvents && siblingEvents.length > 1 && (
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Select Division Hub:</span>
            <Select value={event.id} onValueChange={(val) => onSelectEvent?.(val)}>
              <SelectTrigger className="w-[220px] h-10 border-2 border-black/10 rounded-xl font-black uppercase text-[9px] tracking-widest bg-white text-black hover:border-black/30 transition-all shadow-sm">
                <SelectValue placeholder="Select Division" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-2 bg-white text-black shadow-xl">
                {siblingEvents.map((sib) => (
                  <SelectItem key={sib.id} value={sib.id} className="font-black uppercase text-[10px] cursor-pointer hover:bg-muted/10 transition-colors">
                    {sib.divisionTitle || "Main Division"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="bg-black rounded-[3.5rem] p-6 sm:p-12 text-white relative overflow-hidden shadow-2xl border border-white/5">
        <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none"><Zap className="h-48 w-48 text-primary" /></div>
        <div className="relative z-10 space-y-8">
           <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
             <div className="flex items-center gap-6 text-left">
               <div>
                 <Badge className="bg-primary text-white border-none font-black text-[10px] uppercase tracking-widest mb-1">Elite Series Platform</Badge>
                 <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3">
                   <h1 className="max-w-full break-words text-3xl sm:text-4xl md:text-6xl font-black uppercase tracking-normal leading-tight">{event.title}</h1>
                   {event.divisionTitle && (
                     <Badge className="bg-primary text-white border-none font-black text-[10px] h-6 px-3.5 uppercase tracking-wider">
                       {event.divisionTitle}
                     </Badge>
                   )}
                 </div>
                 <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mt-2">
                   {event.sport || 'General'} • {(event.tournamentTeamsData || []).length} Participating Squads
                 </p>
               </div>
             </div>
             {isStaff && (
               <div className="flex flex-wrap gap-2 self-start">
                 <Button onClick={() => setIsEditModalOpen(true)} className="h-12 rounded-2xl bg-white/10 hover:bg-white/20 text-white border border-white/10 font-black uppercase tracking-widest text-[10px] backdrop-blur-sm shrink-0">
                   <Edit3 className="h-4 w-4 mr-2" /> Modify Series
                 </Button>
                 <Button
                   variant="destructive"
                   onClick={handleDeleteTournament}
                   disabled={isProcessing}
                   aria-label={`Delete tournament ${event.title}`}
                   className="h-12 rounded-2xl font-black uppercase tracking-widest text-[10px] shrink-0"
                 >
                   {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                   {isProcessing ? 'Deleting' : 'Delete'}
                 </Button>
               </div>
             )}
           </div>
           <div className="flex flex-wrap gap-2 pt-4 border-t border-white/10">
             {[
               ['Setup Complete', event.setupStatus === 'complete' || event.isTournament === true],
               ['Bracket Ready', event.bracketStatus === 'ready' || (event.tournamentGames || []).length > 0],
               ['Schedule Ready', event.scheduleStatus === 'ready' || (event.tournamentGames || []).length > 0],
               ['Deployed', event.deploymentStatus === 'deployed' || (event.tournamentGames || []).length > 0],
             ].map(([label, ready]) => (
               <Badge key={String(label)} className={ready ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/20" : "bg-amber-500/15 text-amber-300 border border-amber-400/20"}>
                 {ready ? <CheckCircle2 className="h-3 w-3 mr-1.5" /> : <Clock className="h-3 w-3 mr-1.5" />}{label}
               </Badge>
             ))}
           </div>
           <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 pt-8 border-t border-white/10">
              <div className="space-y-1"><p className="text-[10px] font-black opacity-40 uppercase tracking-widest">Squads</p><p className="text-3xl font-black">{(event.tournamentTeamsData || []).length}</p></div>
              <div className="space-y-1"><p className="text-[10px] font-black opacity-40 uppercase tracking-widest">Matches</p><p className="text-3xl font-black">{(event.tournamentGames || []).length}</p></div>
              <div className="space-y-1"><p className="text-[10px] font-black opacity-40 uppercase tracking-widest">Completion</p><p className="text-3xl font-black">{Math.round(((event.tournamentGames || []).filter(g => g.isCompleted).length / Math.max(1, (event.tournamentGames || []).length)) * 100)}%</p></div>
              <div className="space-y-1"><p className="text-[10px] font-black opacity-40 uppercase tracking-widest">Timeline</p><p className="text-xl font-bold uppercase">{format(new Date(event.date), 'MMMM d')} - {format(new Date(event.endDate || event.date), 'MMMM d, yyyy')}</p></div>
           </div>
            {/* ── Quick Access ── */}
            <div className="flex flex-wrap items-center gap-2 pt-5 border-t border-white/10">
               <span className="text-[9px] font-black uppercase tracking-widest opacity-40 mr-1">Quick Access</span>
               {/* Starter plan: no premium portals */}
               {!isStarter && (
                 <Button size="sm" onClick={() => window.open(`/tournaments/spectator/${activeTeam?.id}/${event.id}`, '_blank')} className="h-8 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/10 font-black uppercase text-[9px] tracking-widest">
                    <Zap className="h-3 w-3 mr-1.5" /> Spectator
                 </Button>
               )}
               {isStaff && !isStarter && (<>
                  <Button size="sm" onClick={() => window.open(`/tournaments/scorekeeper/${activeTeam?.id}/${event.id}`, '_blank')} className="h-8 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/10 font-black uppercase text-[9px] tracking-widest">
                     <Lock className="h-3 w-3 mr-1.5" /> Scorekeeper
                  </Button>
                  <Button size="sm" onClick={() => window.open(`/tournaments/referee/${activeTeam?.id}/${event.id}`, '_blank')} className="h-8 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/10 font-black uppercase text-[9px] tracking-widest">
                     <UserCheck className="h-3 w-3 mr-1.5" /> Referee Portal
                  </Button>
                  <Button size="sm" onClick={() => window.open(`/register/tournament/${activeTeam?.id}/${event.id}`, '_blank')} className="h-8 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/10 font-black uppercase text-[9px] tracking-widest">
                     <Share2 className="h-3 w-3 mr-1.5" /> Registration
                  </Button>
               </>)}
               {isStarter && (
                 <span className="text-[9px] font-black uppercase tracking-widest text-white/30 flex items-center gap-1.5">
                   <Lock className="h-3 w-3" /> Upgrade to Pro to unlock portals
                 </span>
               )}
            </div>
        </div>
      </div>
      
      <TournamentEditDialog event={event} isOpen={isEditModalOpen} onOpenChange={setIsEditModalOpen} />

      <Dialog open={scoreDialogOpen} onOpenChange={setScoreDialogOpen}>
        <DialogContent className="sm:max-w-[440px] bg-white rounded-[3rem] p-10 border-2 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-3xl font-black uppercase tracking-tighter">Match Result</DialogTitle>
            <DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Secure Node Submission</DialogDescription>
            <DialogClose className="absolute right-8 top-8 opacity-70 transition-opacity hover:opacity-100">
              <X className="h-6 w-6" />
            </DialogClose>
          </DialogHeader>
          
          {selectedGame && (
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!db || !activeTeam || !event.tournamentGames) return;
              
              const formData = new FormData(e.currentTarget);
              const rawScore1 = parseInt(formData.get('score1') as string, 10);
              const rawScore2 = parseInt(formData.get('score2') as string, 10);
              const roundName = formData.get('roundName') as string;
              const explicitWinner = formData.get('explicitWinner') as string;

              // ── Explicit winner override: swap scores so advanceBracketMatch
              //    always sees a decisive result in the correct direction.
              //    The stored score1/score2 values reflect the real input; only the
              //    "effective" scores used for bracket routing differ.
              let effectiveScore1 = rawScore1;
              let effectiveScore2 = rawScore2;
              if (explicitWinner === 'team1') {
                // Force team1 to win regardless of actual scores
                if (effectiveScore1 <= effectiveScore2) { effectiveScore1 = (effectiveScore2 || 0) + 1; }
              } else if (explicitWinner === 'team2') {
                // Force team2 to win regardless of actual scores
                if (effectiveScore2 <= effectiveScore1) { effectiveScore2 = (effectiveScore1 || 0) + 1; }
              }

              try {
                if (!firebaseAuth) throw new Error('Your session is unavailable. Refresh and try again.');
                const token = await getAuthToken(firebaseAuth);
                if (!token) throw new Error('Your session has expired. Sign in again.');
                const response = await fetch('/api/tournaments/schedule', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...authHeader(token) },
                  body: JSON.stringify({
                    action: 'score',
                    teamId: activeTeam.id,
                    eventId: event.id,
                    gameId: selectedGame.id,
                    score1: rawScore1,
                    score2: rawScore2,
                    explicitWinner,
                  }),
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(payload.error || 'Unable to submit the tournament score.');

                // 4. Championship celebration for the ultimate final
                const rLower = (roundName || selectedGame.round || '').toLowerCase();
                const isUltimateFinal = rLower === 'championship' || rLower === 'grand final' || rLower === 'championship decider';
                if (isUltimateFinal) {
                  const winnerName = effectiveScore1 > effectiveScore2 ? selectedGame.team1 : selectedGame.team2;
                  setCelebrationWinner(winnerName);
                }

                toast({ title: "Score Synchronized", description: "Match progression pushed to bracket architecture." });
              } catch (err) {
                console.error(err);
                toast({ title: "Sync Failed", variant: "destructive" });
              } finally {
                setScoreDialogOpen(false);
              }
            }} className="space-y-8 pt-4">
               <div className="space-y-3 pb-4 border-b border-muted/20">
                 <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Match Round / Phase</Label>
                 <Input name="roundName" defaultValue={selectedGame.round || ''} className="h-14 font-black uppercase tracking-widest text-sm bg-slate-50 border-2 rounded-2xl focus:bg-white transition-all shadow-inner" />
               </div>
               
               <div className="flex items-center gap-6 justify-between">
                  <div className="space-y-3 flex-1 flex flex-col items-center">
                    <Label className="text-[11px] font-black uppercase tracking-widest text-center truncate max-w-[140px] px-2">{selectedGame.team1}</Label>
                    <Input name="score1" type="number" defaultValue={selectedGame.score1 || 0} required className="h-20 w-full text-4xl font-black text-center rounded-[2rem] bg-slate-50 border-2 border-slate-200 focus:bg-white focus:border-primary transition-all shadow-inner" />
                  </div>
                  <div className="text-xl font-black opacity-10 pt-8 italic tracking-tighter">VS</div>
                  <div className="space-y-3 flex-1 flex flex-col items-center">
                    <Label className="text-[11px] font-black uppercase tracking-widest text-center truncate max-w-[140px] px-2">{selectedGame.team2}</Label>
                    <Input name="score2" type="number" defaultValue={selectedGame.score2 || 0} required className="h-20 w-full text-4xl font-black text-center rounded-[2rem] bg-slate-50 border-2 border-slate-200 focus:bg-white focus:border-primary transition-all shadow-inner" />
                  </div>
               </div>
               
               <div className="space-y-3 pt-4 border-t border-muted/20">
                 <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-2 flex items-center gap-2"><Trophy className="h-3 w-3" /> Assign Winner (Overrides Score)</Label>
                 <select name="explicitWinner" className="w-full h-14 bg-slate-50 border-2 border-slate-200 rounded-2xl px-6 font-black uppercase tracking-widest text-xs focus:ring-primary focus:border-primary">
                    <option value="auto">Auto-detect from Score</option>
                    <option value="team1" className="text-emerald-700">{selectedGame.team1} Advances</option>
                    <option value="team2" className="text-emerald-700">{selectedGame.team2} Advances</option>
                 </select>
               </div>
              <DialogFooter className="gap-3 sm:gap-0">
                 <Button type="button" variant="outline" onClick={() => setScoreDialogOpen(false)} className="rounded-full h-14 px-8 border-2 font-black uppercase tracking-widest text-[10px]">Cancel</Button>
                 <Button type="submit" className="rounded-full h-14 px-10 font-black uppercase tracking-widest text-[10px] bg-primary text-white">Commit Score</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!celebrationWinner} onOpenChange={() => setCelebrationWinner(null)}>
        <DialogContent className="sm:max-w-md bg-black border-none rounded-[4rem] p-12 overflow-hidden">
          <DialogTitle className="sr-only">Championship Celebration</DialogTitle>
          <DialogDescription className="sr-only">Tournament champion result and celebration.</DialogDescription>
          <div className="absolute inset-0 bg-gradient-to-b from-primary/20 via-transparent to-transparent opacity-50" />
          <div className="relative z-10 text-center space-y-8 py-10">
             <div className="flex justify-center">
                <div className="relative">
                   <div className="absolute inset-0 bg-primary blur-[80px] opacity-40 animate-pulse" />
                   <div className="relative bg-gradient-to-br from-yellow-400 to-amber-600 p-8 rounded-[3rem] shadow-[0_0_50px_rgba(245,158,11,0.5)]">
                      <Trophy className="h-28 w-28 text-white animate-bounce" />
                   </div>
                </div>
             </div>
             <div className="space-y-4">
                <Badge className="bg-primary text-white font-black px-6 h-8 uppercase tracking-[0.3em] text-[10px]">Series Champion Declared</Badge>
                <h2 className="text-6xl font-black text-white uppercase tracking-tighter italic leading-none">{celebrationWinner}</h2>
                <p className="text-white/40 font-bold uppercase tracking-widest text-[10px]">Victory Achieved in Elite Tournament Architecture</p>
             </div>
             <Button onClick={() => setCelebrationWinner(null)} className="w-full h-16 rounded-2xl bg-white text-black font-black uppercase text-xs tracking-widest hover:bg-white/90">Dismiss Celebration</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="bg-white rounded-[4rem] border-2 shadow-2xl overflow-hidden flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full">
          <div className="bg-muted/30 p-8 border-b">
            <TabsList className="bg-white/50 h-auto p-2 rounded-[2rem] border-2 w-full flex-wrap gap-1 shadow-inner">
              <TabsTrigger value="itinerary" className="rounded-2xl font-black text-xs uppercase px-10 py-4 flex-1 data-[state=active]:bg-black data-[state=active]:text-white">Matches</TabsTrigger>
              {!isStarter && <TabsTrigger value="officials" className="rounded-2xl font-black text-xs uppercase px-10 py-4 flex-1 data-[state=active]:bg-blue-600 data-[state=active]:text-white">Officials</TabsTrigger>}
              <TabsTrigger value="bracket" className="rounded-2xl font-black text-xs uppercase px-10 py-4 flex-1 data-[state=active]:bg-primary data-[state=active]:text-white">Brackets</TabsTrigger>
              <TabsTrigger value="standings" className="rounded-2xl font-black text-xs uppercase px-10 py-4 flex-1 data-[state=active]:bg-primary data-[state=active]:text-white">Standings</TabsTrigger>
              <TabsTrigger value="roster" className="rounded-2xl font-black text-xs uppercase px-10 py-4 flex-1 data-[state=active]:bg-primary data-[state=active]:text-white flex items-center justify-center gap-2">
                Roster
                {activeTab === 'roster' && isStaff && (
                  <span 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      router.push(`/manage-tournaments/registration/${activeTeam?.id}/${event.id}`); 
                    }} 
                    className="bg-white text-primary text-[8px] font-black uppercase px-2 py-0.5 rounded-full hover:scale-105 transition-all shadow-sm shrink-0"
                  >
                    + Add Teams
                  </span>
                )}
              </TabsTrigger>
              {isStaff && <TabsTrigger value="safety" className="rounded-2xl font-black text-xs uppercase px-10 py-4 flex-1 data-[state=active]:bg-red-600 data-[state=active]:text-white">Safety</TabsTrigger>}
              {!isStarter && <TabsTrigger value="architecture" className="rounded-2xl font-black text-xs uppercase px-10 py-4 flex-1 data-[state=active]:bg-orange-600 data-[state=active]:text-white">Architecture</TabsTrigger>}
            </TabsList>
          </div>
          <div className="p-8 lg:p-14">
             <TabsContent value="architecture" className="mt-0 space-y-6">
                {/* ── Registration Architect (moved to top) ── */}
                <div className="bg-[#050505] rounded-[3rem] border border-white/10 overflow-hidden">
                  <div className="h-0.5 bg-gradient-to-r from-white/20 via-white/5 to-transparent w-full" />
                  <div className="p-10">
                    <div className="flex items-center justify-between gap-6">
                      <div className="flex items-center gap-4">
                        <div className="border border-white/20 p-3 rounded-xl text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]"><FileSignature className="h-5 w-5" /></div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-0.5">Form Builder</p>
                          <h3 className="text-2xl font-black uppercase tracking-tight text-white">Registration Architect</h3>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Custom Intake Forms &amp; Documentation</p>
                        </div>
                      </div>
                      <Button
                        onClick={() => router.push(`/manage-tournaments/registration/${activeTeam?.id}/${event.id}`)}
                        className="h-14 px-8 rounded-2xl bg-white text-black hover:bg-white/90 font-black uppercase text-xs tracking-widest shadow-[0_0_20px_rgba(255,255,255,0.1)] shrink-0"
                      >
                        Launch Builder <ExternalLink className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* ── Scorekeeper Code ── */}
                <div className="bg-[#050505] rounded-[3rem] border border-white/10 overflow-hidden">
                  <div className="h-0.5 bg-gradient-to-r from-primary via-orange-500 to-transparent w-full" />
                  <div className="p-10 space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="border border-white/20 p-3 rounded-xl text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]"><Lock className="h-5 w-5" /></div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-0.5">Access Control</p>
                        <h3 className="text-2xl font-black uppercase tracking-tight text-white">Scorekeeper Code</h3>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Required to submit scores in the scorekeeper portal</p>
                      </div>
                    </div>
                    <ScorekeeperCodeEditor event={event} />
                  </div>
                </div>

                {/* ── DARK SYSTEM: Bracket Telemetry ── */}
                <div className="bg-[#050505] rounded-[3rem] border border-white/10 overflow-hidden">
                  <div className="h-0.5 bg-gradient-to-r from-primary via-orange-500 to-transparent w-full" />
                  <div className="p-10 space-y-8">
                    <div className="flex items-center gap-4">
                      <div className="border border-white/20 p-3 rounded-xl text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]"><Zap className="h-5 w-5" /></div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-0.5">Telemetry Engine</p>
                        <h3 className="text-2xl font-black uppercase tracking-tight text-white">Bracket Telemetry</h3>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Automated Seeding &amp; Progression</p>
                      </div>
                    </div>

                    <div className={cn("grid grid-cols-1 gap-6", event.tournamentType === 'pool_play_knockout' && "md:grid-cols-2")}>
                      {event.tournamentType === 'pool_play_knockout' && (
                      <div className="bg-[#0a0a0a] p-8 rounded-[2rem] border border-white/5 space-y-6">
                        <div className="space-y-2">
                          <Badge className="bg-primary/20 text-primary border border-primary/30 font-black text-[8px] uppercase tracking-widest">Pro Tool</Badge>
                          <h4 className="text-lg font-black uppercase tracking-tight text-white">Seed from Standings</h4>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 leading-relaxed">Populate knockout slots from completed, pool-specific standings and configured qualifier counts.</p>
                        </div>
                        <Button onClick={seedBracketFromStandings} className="w-full h-14 rounded-2xl bg-white text-black hover:bg-white/90 font-black uppercase text-xs tracking-widest transition-all active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                          Seed Pool Qualifiers <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                      )}

                      <div className="bg-[#0a0a0a] p-8 rounded-[2rem] border border-white/5 space-y-6 relative overflow-hidden">
                        <div className="absolute inset-0 bg-emerald-500/[0.03]" />
                        <div className="relative space-y-2">
                          <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-black text-[8px] uppercase tracking-widest">Active</Badge>
                          <h4 className="text-lg font-black uppercase tracking-tight text-white">Winner Progression</h4>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 leading-relaxed">Matches are linked. Winners of Semi-Finals automatically advance to Championship.</p>
                        </div>
                        <div className="relative flex items-center gap-2 text-emerald-400 font-black text-[10px] uppercase tracking-widest">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Synchronization Active
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* ── OFFICIALS TAB ── */}
              <TabsContent value="officials" className="mt-0 space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
                  {/* Pool */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 px-2">
                      <div className="bg-blue-500/10 p-3 rounded-2xl text-blue-600"><UserCheck className="h-6 w-6" /></div>
                      <div>
                        <h2 className="text-xl font-black uppercase tracking-tight">Official Pool</h2>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Certified referees for this series</p>
                      </div>
                    </div>
                    {isStaff && (
                      <Card className="rounded-[2.5rem] p-8 border-2 border-dashed bg-muted/5 space-y-5">
                        <h3 className="text-sm font-black uppercase tracking-widest">Add Official</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div><Label className="text-[9px] uppercase font-black tracking-widest">Name *</Label>
                            <Input value={newRefName} onChange={e => setNewRefName(e.target.value)} placeholder="Full name" className="h-11 rounded-xl border-2 mt-1" /></div>
                          <div><Label className="text-[9px] uppercase font-black tracking-widest">Email *</Label>
                            <Input value={newRefEmail} onChange={e => setNewRefEmail(e.target.value)} placeholder="ref@email.com" type="email" className="h-11 rounded-xl border-2 mt-1" /></div>
                          <div><Label className="text-[9px] uppercase font-black tracking-widest">Phone</Label>
                            <Input value={newRefPhone} onChange={e => setNewRefPhone(e.target.value)} placeholder="(555) 000-0000" className="h-11 rounded-xl border-2 mt-1" /></div>
                          <div><Label className="text-[9px] uppercase font-black tracking-widest">Cert. Level</Label>
                            <Input value={newRefCert} onChange={e => setNewRefCert(e.target.value)} placeholder="Regional / State / National" className="h-11 rounded-xl border-2 mt-1" /></div>
                        </div>
                        <Button onClick={handleAddReferee} disabled={!newRefName.trim() || !newRefEmail.trim() || isSavingRef} className="w-full h-11 rounded-2xl font-black uppercase text-xs tracking-widest">
                          {isSavingRef ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserCheck className="h-4 w-4 mr-2" />Add to Official Pool</>}
                        </Button>
                      </Card>
                    )}
                    <div className="space-y-3">
                      {(event.refereePool || []).length === 0 ? (
                        <div className="text-center py-16 opacity-30">
                          <UserCheck className="h-12 w-12 mx-auto mb-3" />
                          <p className="text-sm font-black uppercase tracking-widest">No officials in pool</p>
                          <p className="text-[10px] uppercase tracking-widest mt-1">Add referees above to get started</p>
                        </div>
                      ) : (event.refereePool || []).map((ref: TournamentReferee) => {
                        const assignCount = (event.tournamentGames || []).filter((g: any) => g.refereeId === ref.id).length;
                        return (
                          <Card key={ref.id} className="rounded-[2rem] p-5 border-none shadow-md bg-white flex items-center justify-between group hover:shadow-lg transition-all">
                            <div className="space-y-1 min-w-0 mr-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-black text-sm uppercase tracking-tight truncate">{ref.name}</p>
                                {ref.certLevel && <Badge className="bg-blue-50 text-blue-700 border-none font-black text-[8px] uppercase tracking-widest shrink-0">{ref.certLevel}</Badge>}
                                {assignCount > 0 && <Badge className="bg-black text-white border-none font-black text-[8px] uppercase tracking-widest shrink-0">{assignCount} match{assignCount !== 1 ? 'es' : ''}</Badge>}
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-[9px] text-muted-foreground font-bold">
                                <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{ref.email}</span>
                                {ref.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{ref.phone}</span>}
                              </div>
                            </div>
                            {isStaff && (
                              <Button variant="ghost" size="icon" onClick={() => handleRemoveReferee(ref.id)} className="h-9 w-9 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/5 shrink-0">
                                <UserMinus className="h-4 w-4" />
                              </Button>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                  {/* Assignments */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 px-2">
                      <div className="bg-black p-3 rounded-2xl text-white"><CalendarDays className="h-6 w-6" /></div>
                      <div>
                        <h2 className="text-xl font-black uppercase tracking-tight">Match Assignments</h2>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Assign officials · Conflict detection active</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {(() => {
                        // Show ALL non-conditional matches — referees must be booked for
                        // every game, including bracket slots where teams are still TBD.
                        const assignable = (event.tournamentGames || []).filter(
                          (g: TournamentGame) => !(g as any).isConditional
                        );
                        if (assignable.length === 0) return (
                          <div className="text-center py-16 opacity-30">
                            <CalendarDays className="h-12 w-12 mx-auto mb-3" />
                            <p className="text-sm font-black uppercase tracking-widest">No matches scheduled yet</p>
                          </div>
                        );
                        return assignable.map((game: any) => (
                          <Card key={game.id} className="rounded-[2rem] p-5 border-none shadow-md bg-white space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-black text-sm uppercase tracking-tight">{game.team1} <span className="text-muted-foreground/40 font-normal">vs</span> {game.team2}</p>
                                <p className="text-[9px] font-bold text-muted-foreground uppercase">{(() => { try { return format(parseISO(game.date), 'MMMM d, yyyy'); } catch { return game.date; } })()}{game.time ? ` · ${(() => { try { return format(new Date(`2000-01-01T${game.time}`), 'h:mm a'); } catch { return game.time; } })()}` : ''}{game.location ? ` · ${game.location}` : ''}</p>
                              </div>
                              {game.round && <Badge variant="outline" className="text-[9px] font-black uppercase border-2 shrink-0">{game.round}</Badge>}
                            </div>
                            {isStaff ? (
                              <Select value={game.refereeId || 'unassigned'} onValueChange={val => handleAssignReferee(game.id, val === 'unassigned' ? null : (event.refereePool || []).find((r: TournamentReferee) => r.id === val) || null)}>
                                <SelectTrigger className={cn('h-10 rounded-xl border-2 font-black uppercase text-[10px] tracking-widest', game.refereeId ? 'border-blue-200 bg-blue-50 text-blue-700' : '')}>
                                  <SelectValue placeholder="Assign Official" />
                                </SelectTrigger>
                                <SelectContent className="rounded-2xl">
                                  <SelectItem value="unassigned" className="font-black uppercase text-[10px]">— No Official Assigned —</SelectItem>
                                  {(event.refereePool || []).map((ref: TournamentReferee) => {
                                    const conflict = findRefereeConflict(ref.id, game, (event.tournamentGames || []).filter((g: TournamentGame) => g.id !== game.id));
                                    return (
                                      <SelectItem key={ref.id} value={ref.id} className={cn('font-black uppercase text-[10px]', conflict ? 'text-destructive/70' : '')}>
                                        {ref.name}{conflict ? ' ⚠ Conflict' : ''}
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                            ) : game.refereeName ? (
                              <div className="flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-xl">
                                <UserCheck className="h-3 w-3 text-blue-600 shrink-0" />
                                <span className="text-[9px] font-black uppercase tracking-widest text-blue-700">{game.refereeName}</span>
                              </div>
                            ) : null}
                          </Card>
                        ));
                      })()}
                    </div>
                    {isStaff && (
                      <Card className="rounded-[2.5rem] p-8 border-none shadow-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white space-y-4 mt-2">
                        <div className="flex items-center gap-3">
                          <div className="bg-white/15 p-3 rounded-xl"><UserCheck className="h-6 w-6" /></div>
                          <div>
                            <h3 className="font-black text-lg uppercase tracking-tight">Referee Portal</h3>
                            <p className="text-[9px] text-white/60 font-bold uppercase tracking-widest">Share this link with your officials</p>
                          </div>
                        </div>
                        <Button onClick={() => window.open(`/tournaments/referee/${activeTeam?.id}/${event.id}`, '_blank')} className="w-full h-12 rounded-2xl bg-white text-blue-700 font-black uppercase text-xs tracking-widest hover:bg-blue-50">
                          Launch Referee Portal <ExternalLink className="ml-2 h-4 w-4" />
                        </Button>
                      </Card>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="roster" className="mt-0 space-y-10">
                  <div className="bg-white rounded-[4rem] shadow-2xl border-2 border-black/5 overflow-hidden">
                    <div className="p-10 border-b bg-muted/5 flex items-center justify-between">
                      <div className="flex items-center gap-6">
                        <div className="bg-primary/10 p-4 rounded-2xl text-primary shadow-sm">
                          <Users className="h-7 w-7" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-black uppercase tracking-tight">System Roster & Compliance</h3>
                          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">Verified competitors & Audit Status</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Button 
                          variant="outline" 
                          onClick={handleSyncLogos} 
                          disabled={isProcessing}
                          className="h-12 px-6 rounded-2xl font-black uppercase text-[10px] tracking-widest border-2 hover:bg-muted/10 transition-all"
                        >
                          <RefreshCw className={cn("h-4 w-4 mr-2", isProcessing && "animate-spin")} /> Sync Logos
                        </Button>
                        <Badge className="bg-black text-white border-none font-black text-[10px] uppercase h-10 px-6 rounded-full flex items-center gap-2">
                          {event.tournamentTeamsData?.length || 0} SQUADS ENROLLED
                        </Badge>
                      </div>
                    </div>
                    {isStaff && (event.tournamentGames || []).length === 0 && (
                      <div className="p-10 bg-muted/5 border-b space-y-6 text-left">
                        <h4 className="font-black text-sm uppercase tracking-widest text-primary">Add Team to Division</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-1">Team Name</Label>
                            <Input id="direct-team-name" placeholder="Enter team name..." className="h-12 rounded-xl border-2 font-bold uppercase bg-white" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-1">Coach Name (Optional)</Label>
                            <Input id="direct-team-coach" placeholder="Enter coach name..." className="h-12 rounded-xl border-2 font-bold bg-white" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-1">Coach Email (Optional)</Label>
                            <Input id="direct-team-email" type="email" placeholder="Enter coach email..." className="h-12 rounded-xl border-2 font-bold bg-white" />
                          </div>
                        </div>
                        <div className="flex justify-end pt-2">
                          <Button 
                            onClick={async () => {
                              const nameVal = (document.getElementById('direct-team-name') as HTMLInputElement)?.value || '';
                              const coachVal = (document.getElementById('direct-team-coach') as HTMLInputElement)?.value || '';
                              const emailVal = (document.getElementById('direct-team-email') as HTMLInputElement)?.value || '';
                              if (!nameVal.trim()) {
                                toast({ title: "Name Required", description: "Team name is required.", variant: "destructive" });
                                return;
                              }
                              await handleAddTeamDirectly(nameVal, coachVal, emailVal);
                              (document.getElementById('direct-team-name') as HTMLInputElement).value = '';
                              (document.getElementById('direct-team-coach') as HTMLInputElement).value = '';
                              (document.getElementById('direct-team-email') as HTMLInputElement).value = '';
                            }}
                            className="h-12 px-6 rounded-xl bg-black hover:bg-black/90 text-white font-black uppercase text-[10px] tracking-widest shadow-md"
                          >
                            <Plus className="h-4 w-4 mr-2" /> Add Team to Division
                          </Button>
                        </div>
                      </div>
                    )}
                    <div className="divide-y divide-black/5">
                      {event.tournamentTeamsData?.map((team: any, idx: number) => {
                        const agreement = (event as any).teamAgreements?.[team.name];
                        const isSigned = agreement?.agreed === true || agreement?.status === 'signed';
                        return (
                          <div key={idx} className="p-8 flex items-center justify-between hover:bg-muted/5 transition-all group">
                            <div className="flex items-center gap-8 flex-1 min-w-0">
                              <SquadIdentity 
                                teamId={team.id} 
                                teamName={team.name} 
                                logoUrl={team.logoUrl} 
                                logoClassName="h-20 w-20 rounded-[1.5rem] shadow-xl border-2 shrink-0 bg-white" 
                                hideName={true}
                                horizontal={true}
                              />
                              <div className="min-w-0">
                                <h4 className="font-black text-3xl uppercase tracking-tighter leading-none mb-2 truncate">{team.name}</h4>
                                <div className="flex items-center gap-4">
                                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                    <Users className="h-3 w-3" /> {team.coach || 'Head Coach Unassigned'}
                                  </p>
                                  <div className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                                  {isSigned ? (
                                    <div className="flex items-center gap-2 text-green-600 font-black text-[10px] uppercase tracking-widest">
                                      <CheckCircle2 className="h-4 w-4" strokeWidth={3} /> Verified Compliance
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2 text-amber-500 font-black text-[10px] uppercase tracking-widest">
                                      <AlertCircle className="h-4 w-4" /> Awaiting Waiver
                                    </div>
                                  )}
                                </div>
                                {(event.waiverDocuments || []).length > 0 && <p className="mt-2 text-[9px] font-bold uppercase text-muted-foreground">Required: {event.waiverDocuments?.map(document => document.title).join(', ')}{isSigned && agreement?.signedAt ? ` • Signed ${format(new Date(agreement.signedAt), 'MMM d, yyyy')}` : ''}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 px-4">
                              {isStaff && (event.tournamentGames || []).length === 0 && (
                                <Button
                                  variant="ghost"
                                  onClick={() => handleRemoveTeamDirectly(team.id, team.name)}
                                  className="h-14 px-4 rounded-2xl font-black uppercase text-xs tracking-widest text-red-500 hover:text-red-600 hover:bg-red-50 transition-all border-2 border-transparent hover:border-red-200"
                                >
                                  <Trash2 className="h-5 w-5" />
                                </Button>
                              )}
                              {isStaff && (
                                <Button
                                  variant="ghost"
                                  onClick={() => setLogoEditState({ idx, name: team.name, url: team.logoUrl || '' })}
                                  className="h-14 px-8 rounded-2xl font-black uppercase text-xs tracking-widest text-primary hover:bg-primary/5 border-2 border-transparent hover:border-primary/20 transition-all"
                                >
                                  {team.logoUrl ? 'EDIT LOGO' : 'UPLOAD LOGO'}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {(!event.tournamentTeamsData || event.tournamentTeamsData.length === 0) && (
                    <div className="py-32 text-center opacity-40 font-black uppercase tracking-widest">No active squads are assigned to this series.</div>
                  )}

                 {/* Logo Edit Dialog */}
                 <Dialog open={!!logoEditState} onOpenChange={(o) => !o && setLogoEditState(null)}>
                   <DialogContent className="rounded-[3rem] sm:max-w-md p-0 overflow-hidden border-none shadow-2xl bg-white">
                     <div className="h-2 bg-primary w-full" />
                     <div className="p-8 space-y-6">
                       <DialogHeader>
                         <DialogTitle className="text-2xl font-black uppercase tracking-tight">Set Squad Logo</DialogTitle>
                         <DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{logoEditState?.name}</DialogDescription>
                       </DialogHeader>
                       <div className="space-y-3">
                         <Label className="text-[10px] font-black uppercase tracking-widest">Upload Team Logo</Label>
                         <input
                           ref={logoFileInputRef}
                           type="file"
                           accept="image/jpeg,image/png,image/webp"
                           className="hidden"
                           onChange={(event) => void handleTeamLogoFile(event.target.files?.[0])}
                         />
                         <Button
                           type="button"
                           variant="outline"
                           onClick={() => logoFileInputRef.current?.click()}
                           disabled={isOptimizingLogo}
                           className="w-full h-12 rounded-2xl border-2 font-black uppercase text-xs"
                         >
                           {isOptimizingLogo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2 rotate-180" />}
                           {isOptimizingLogo ? 'Optimizing Image' : 'Choose JPG, PNG or WEBP'}
                         </Button>
                         <div className="relative py-1 text-center">
                           <span className="bg-white px-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground">or paste an image URL</span>
                         </div>
                         <Input
                           placeholder="https://example.com/logo.png"
                           value={logoEditState?.url || ''}
                           onChange={(e) => setLogoEditState(s => s ? { ...s, url: e.target.value } : null)}
                           className="h-12 rounded-2xl border-2 font-medium"
                         />
                         {logoEditState?.url && (
                           <div className="flex justify-center pt-2">
                             <div className="h-20 w-20 rounded-2xl border-2 p-2 bg-muted/5 shadow-inner overflow-hidden">
                               <img src={logoEditState.url} alt="Preview" className="w-full h-full object-contain" onError={(e) => (e.currentTarget.style.opacity = '0.2')} />
                             </div>
                           </div>
                         )}
                       </div>
                       <DialogFooter>
                         <Button onClick={handleSaveTeamLogo} disabled={isOptimizingLogo || !logoEditState?.url} className="w-full h-12 rounded-2xl font-black uppercase text-xs tracking-widest">
                           <Save className="h-4 w-4 mr-2" /> Save Logo
                         </Button>
                       </DialogFooter>
                     </div>
                   </DialogContent>
                 </Dialog>


              </TabsContent>
              <TabsContent value="safety" className="mt-0 space-y-8">
                <EventSafetyPanel kind="tournament" eventId={event.id} eventName={event.title} divisions={event.divisionTitle ? [event.divisionTitle] : []} />
              </TabsContent>

             <TabsContent value="itinerary" className="mt-0 space-y-12">
               {(event.tournamentGames || []).length > 0 ? (
                 <>
                   {Object.entries(gamesByDay).map(([date, dayGames]: [string, any]) => (
                     <div key={date} className="space-y-8">
                       <div className="flex items-center gap-4">
                         <div className="h-px flex-1 bg-muted" />
                         <Badge variant="outline" className="bg-white border-2 border-primary/10 px-6 h-10 rounded-full text-[10px] font-black uppercase tracking-[0.2em] text-primary shadow-sm">
                           {format(parseISO(date), 'EEEE, MMMM d, yyyy')}
                         </Badge>
                         <div className="h-px flex-1 bg-muted" />
                       </div>
                       <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                         {dayGames.map((game: any) => {
                           const isTBD = game.team1.toLowerCase().includes('tbd') || game.team2.toLowerCase().includes('tbd');
                           return (
                             <Card key={game.id} className={cn(
                               "rounded-[2.5rem] border-none shadow-xl ring-1 ring-black/5 bg-white p-8 space-y-6 transition-all hover:shadow-2xl hover:ring-primary/20 group relative overflow-hidden",
                               isTBD && "bg-muted/5 ring-1 ring-dashed ring-black/20",
                               isStaff && "cursor-pointer"
                             )} onClick={() => {
                               if (isStaff) {
                                 setSelectedGame(game);
                                 setScoreDialogOpen(true);
                               }
                             }}>
                               {isTBD && (
                                 <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none -rotate-12">
                                   <Clock className="h-16 w-16" />
                                 </div>
                               )}
                               <div className="flex items-center justify-between">
                                  <Badge className={cn("px-3 h-7 text-[9px] font-black uppercase tracking-widest cursor-default", isTBD ? "bg-muted text-muted-foreground" : "bg-black text-white")}>
                                    {game.time}
                                  </Badge>
                                  {game.round && (
                                    <Badge variant="outline" className={cn(
                                      "text-[9px] font-black uppercase cursor-default max-w-[140px] truncate",
                                      isTBD ? "border-dashed" : "border-2",
                                      ((game.round || '').toLowerCase().includes('winners bracket') || /^wb\s/i.test(game.round || ''))
                                        ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                                      : ((game.round || '').toLowerCase().includes('losers bracket') || /^lb\s/i.test(game.round || ''))
                                        ? 'border-orange-300 text-orange-600 bg-orange-50'
                                      : ((game.round || '').toLowerCase().includes('championship') || (game.round || '').toLowerCase().includes('grand final'))
                                        ? 'border-primary/40 text-primary bg-primary/5'
                                      : (game.round || '').toLowerCase().includes('decider')
                                        ? 'border-dashed border-muted-foreground/30 text-muted-foreground bg-muted/30 italic'
                                      : ''
                                    )}>
                                      {formatRoundBadge(game.round)}
                                    </Badge>
                                  )}
                               </div>
                               <div className="flex flex-col gap-6 items-center text-center relative z-10 cursor-default">
                                  <div className="w-full flex flex-col items-center gap-2">
                                     <SquadIdentity
                                       teamId={(game as any).team1Id}
                                       teamName={game.team1}
                                       logoUrl={event.tournamentTeamsData?.find((t: any) => t.id === (game as any).team1Id || t.name === game.team1)?.logoUrl}
                                       logoClassName="h-12 w-12 rounded-xl shadow-sm border-2 shrink-0"
                                       showNameWithLogo
                                       textClassName={cn("font-black text-[11px] uppercase opacity-40 truncate", isTBD && game.team1.toLowerCase().includes('tbd') && "italic")}
                                     />
                                     <p className={cn("text-4xl font-black tracking-tighter", isTBD ? "opacity-20" : "")}>{game.score1}</p>
                                  </div>
                                  <div className="opacity-10 font-black text-xs italic">VS</div>
                                  <div className="w-full flex flex-col items-center gap-2">
                                     <SquadIdentity
                                       teamId={(game as any).team2Id}
                                       teamName={game.team2}
                                       logoUrl={event.tournamentTeamsData?.find((t: any) => t.id === (game as any).team2Id || t.name === game.team2)?.logoUrl}
                                       logoClassName="h-12 w-12 rounded-xl shadow-sm border-2 shrink-0"
                                       showNameWithLogo
                                       textClassName={cn("font-black text-[11px] uppercase opacity-40 truncate", isTBD && game.team2.toLowerCase().includes('tbd') && "italic")}
                                     />
                                     <p className={cn("text-4xl font-black tracking-tighter", isTBD ? "opacity-20" : "")}>{game.score2}</p>
                                  </div>
                               </div>
                               {game.location && <div className="pt-4 border-t border-muted/50 flex items-center justify-center gap-2 cursor-default"><MapPin className="h-3 w-3 text-primary opacity-50" /><span className="text-[9px] font-black text-muted-foreground uppercase">{game.location}</span></div>}
                             </Card>
                           );
                         })}
                       </div>
                     </div>
                   ))}
                 </>
                ) : (
                  <div className="text-center py-20 border-4 border-dashed rounded-[3rem] bg-muted/5 flex flex-col items-center max-w-2xl mx-auto space-y-6 animate-in fade-in duration-500">
                    <div className="bg-primary/10 p-6 rounded-[2rem] text-primary shadow-inner">
                      <CalendarDays className="h-12 w-12" />
                    </div>
                    {deploymentError && (
                      <div className="max-w-md rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700" role="alert">
                        Deployment failed: {deploymentError} Your setup is preserved; correct the issue and retry.
                      </div>
                    )}
                    <div className="space-y-2">
                      <h3 className="text-3xl font-black uppercase tracking-tighter text-black">Schedule Not Deployed</h3>
                      <p className="text-muted-foreground uppercase text-[10px] font-black tracking-widest max-w-sm mx-auto text-center leading-relaxed">
                        The operational fixtures for this division have not been compiled yet. Click below to initiate scheduling constraints and generate matches.
                      </p>
                    </div>
                    <Button 
                      onClick={handleGenerateSchedule} 
                      disabled={isProcessing} 
                      className="h-14 px-8 rounded-2xl bg-black text-white hover:bg-black/90 font-black uppercase text-xs tracking-wider shadow-lg flex items-center gap-2"
                    >
                      {isProcessing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 text-primary" />
                      )}
                      + Generate Tourney Schedule
                    </Button>
                  </div>
                )}
             </TabsContent>
             <TabsContent value="bracket" className="mt-0">
               {(event.tournamentGames || []).length > 0 ? (
                 <TournamentBracket 
                   games={event.tournamentGames || []} 
                   onGameClick={handleGameClick} 
                   tournamentName={event.title}
                 />
               ) : (
                 <div className="text-center py-20 border-4 border-dashed rounded-[3rem] bg-muted/5 flex flex-col items-center max-w-2xl mx-auto space-y-6">
                   <div className="bg-primary/10 p-6 rounded-[2rem] text-primary shadow-inner">
                     <CalendarDays className="h-12 w-12" />
                   </div>
                   <h3 className="text-3xl font-black uppercase tracking-tighter text-black">Bracket Not Initialized</h3>
                   <p className="text-muted-foreground uppercase text-[10px] font-black tracking-widest max-w-md text-center">
                     Matches must be scheduled before the bracket tree can be rendered. Please initialize the roster and generate the tournament schedule.
                   </p>
                 </div>
               )}
             </TabsContent>
             <TabsContent value="standings" className="mt-0 space-y-8">
                {(!event.tournamentGames || event.tournamentGames.length === 0) ? (
                  <div className="text-center py-20 border-4 border-dashed rounded-[3rem] bg-muted/5 flex flex-col items-center max-w-2xl mx-auto space-y-6">
                    <div className="bg-primary/10 p-6 rounded-[2rem] text-primary shadow-inner">
                      <Trophy className="h-12 w-12" />
                    </div>
                    <h3 className="text-3xl font-black uppercase tracking-tighter text-black">No Standings Available</h3>
                    <p className="text-muted-foreground uppercase text-[10px] font-black tracking-widest max-w-md text-center">
                      Standings will compute automatically once matches are generated and scored.
                    </p>
                  </div>
                ) : poolStandings ? (
                  poolStandings.map(pool => (
                    <div key={pool.label}>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-3 px-1">Pool {pool.label}</p>
                      <Card className="rounded-[2.5rem] border-none shadow-xl ring-1 ring-black/5 overflow-hidden">
                        <table className="w-full text-left">
                          <thead className="bg-muted/30 border-b text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                            <tr><th className="px-10 py-5">Squad Rank</th><th className="text-center">W</th><th className="text-center">L</th><th className="text-center">T</th><th className="text-center">PTS</th></tr>
                          </thead>
                          <tbody className="divide-y divide-black/5">
                            {pool.rows.map((t: any, idx: number) => (
                              <tr key={t.name} className="hover:bg-muted/10 transition-colors">
                                <td className="px-10 py-6">
                                  <div className="flex items-center gap-4">
                                    <span className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-[10px] font-black shrink-0">{idx + 1}</span>
                                    <SquadIdentity
                                      teamId={event.tournamentTeamsData?.find((td: any) => td.name === t.name)?.id}
                                      teamName={t.name}
                                      logoUrl={event.tournamentTeamsData?.find((td: any) => td.name === t.name)?.logoUrl}
                                      logoClassName="h-8 w-8 rounded-xl shadow-sm border-2 shrink-0"
                                      showNameWithLogo horizontal
                                      textClassName="font-black uppercase text-sm"
                                    />
                                  </div>
                                </td>
                                <td className="text-center font-bold text-emerald-600">{t.wins}</td>
                                <td className="text-center font-bold text-red-600">{t.losses}</td>
                                <td className="text-center font-bold text-muted-foreground">{t.ties}</td>
                                <td className="text-center bg-primary/[0.03]"><Badge className="bg-primary text-white font-black px-4">{t.points}</Badge></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </Card>
                    </div>
                  ))
                ) : (
                  <Card className="rounded-[2.5rem] border-none shadow-xl ring-1 ring-black/5 overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-muted/30 border-b text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                        <tr><th className="px-10 py-5">Squad Rank</th><th className="text-center">W</th><th className="text-center">L</th><th className="text-center">T</th><th className="text-center">PTS</th></tr>
                      </thead>
                      <tbody className="divide-y divide-black/5">
                        {standings.map((t, idx) => (
                          <tr key={t.name} className="hover:bg-muted/10 transition-colors">
                            <td className="px-10 py-6">
                              <div className="flex items-center gap-4">
                                <span className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-[10px] font-black shrink-0">{idx + 1}</span>
                                <SquadIdentity
                                  teamId={event.tournamentTeamsData?.find((td: any) => td.name === t.name)?.id}
                                  teamName={t.name}
                                  logoUrl={event.tournamentTeamsData?.find((td: any) => td.name === t.name)?.logoUrl}
                                  logoClassName="h-8 w-8 rounded-xl shadow-sm border-2 shrink-0"
                                  showNameWithLogo horizontal
                                  textClassName="font-black uppercase text-sm"
                                />
                              </div>
                            </td>
                            <td className="text-center font-bold text-emerald-600">{t.wins}</td>
                            <td className="text-center font-bold text-red-600">{t.losses}</td>
                            <td className="text-center font-bold text-muted-foreground">{t.ties}</td>
                            <td className="text-center bg-primary/[0.03]"><Badge className="bg-primary text-white font-black px-4">{t.points}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                )}
             </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

export function ManageTournamentsPageContent({ embedded = false }: { embedded?: boolean }) {
  const { activeTeam, db, firebaseUser: user, isStaff, isPrimaryClubAuthority, isStarter } = useTeam();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [duplicateTitle, setDuplicateTitle] = useState('');
  const [isDuplicateOpen, setIsDuplicateOpen] = useState(false);
  const [duplicatingEvent, setDuplicatingEvent] = useState<TeamEvent | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const eventsQuery = useMemoFirebase(() => {
    if (!db || !activeTeam?.id) return null;
    return query(collection(db, 'teams', activeTeam.id, 'events'), where('isTournament', '==', true));
  }, [db, activeTeam?.id]);
  
  const { data: rawEvents, isLoading } = useCollection<TeamEvent>(eventsQuery);
  const events = useMemo(() => {
    if (!rawEvents) return [];
    return rawEvents
      .filter(e => showArchived ? e.isArchived : !e.isArchived)
      .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [rawEvents, showArchived]);

  const groupedEvents = useMemo(() => {
    const groups: { name: string; items: TeamEvent[] }[] = [];
    events.forEach(e => {
      let grp = groups.find(g => g.name.toLowerCase() === e.title.toLowerCase());
      if (!grp) {
        grp = { name: e.title, items: [] };
        groups.push(grp);
      }
      grp.items.push(e);
    });
    return groups;
  }, [events]);

  const hasArchived = useMemo(() => (rawEvents || []).some(e => e.isArchived), [rawEvents]);

  const activeEvent = useMemo(() => rawEvents?.find(e => e.id === selectedEventId), [rawEvents, selectedEventId]);

  const handleDuplicateTournament = async () => {
    if (!duplicatingEvent || !duplicateTitle.trim() || !db || !activeTeam || !user?.uid) {
      toast({ title: "Replication Error", description: "Authorization or source data missing.", variant: "destructive" });
      return;
    }
    setIsProcessing(true);
    try {
      const newEventRef = doc(collection(db, 'teams', activeTeam.id, 'events'));
      const newEventData = {
        // Essential framework
        title: duplicateTitle.trim(),
        date: duplicatingEvent.date || '',
        endDate: duplicatingEvent.endDate || '',
        location: duplicatingEvent.location || '',
        registrationCost: duplicatingEvent.registrationCost || '0',
        adminEmails: duplicatingEvent.adminEmails || [],
        isTournament: true,
        tournamentType: duplicatingEvent.tournamentType || '',
        venueSettings: duplicatingEvent.venueSettings || {},
        
        // Reset operational state
        id: newEventRef.id,
        teamId: activeTeam.id,
        creatorId: user.uid,
        createdAt: new Date().toISOString(),
        isArchived: false,
        isCompleted: false,
        tournamentTeamsData: [],
        tournamentGames: [],
        schedule: [],
        archived_waivers: []
      };
      
      const { setDoc, getDoc } = await import('firebase/firestore');
      await setDoc(newEventRef, newEventData);

      // Duplicate Registration Config (team_config)
      const sourceCfgRef = doc(db, 'teams', activeTeam.id, 'events', duplicatingEvent.id, 'registration', 'team_config');
      const sourceCfg = await getDoc(sourceCfgRef);
      if (sourceCfg.exists()) {
        await setDoc(doc(db, 'teams', activeTeam.id, 'events', newEventRef.id, 'registration', 'team_config'), sourceCfg.data());
      }

      setIsDuplicateOpen(false);
      setDuplicateTitle('');
      setDuplicatingEvent(null);
      toast({ title: "Series Replicated", description: "Tournament blueprint cloned. Opening new series hub..." });
      
      // Auto-select the fresh duplicate
      setSelectedEventId(newEventRef.id);
    } catch (e: any) {
      console.error("[Tournaments] Replication failed:", e);
      toast({ title: "Replication Failed", description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  if (activeEvent) {
    return (
      <div className="p-8 lg:p-14">
        <TournamentDetailView 
          event={activeEvent} 
          onBack={() => setSelectedEventId(null)} 
          allEvents={rawEvents || []}
          onSelectEvent={(id) => setSelectedEventId(id)}
        />
      </div>
    );
  }

  return (
    <div className={embedded ? "space-y-10" : "p-8 lg:p-14 space-y-12"}>
      {!embedded ? (
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="space-y-2">
            <Badge className="bg-primary text-white border-none font-black text-[10px] px-4 h-7 uppercase tracking-[0.2em] shadow-xl">Series Operations Hub</Badge>
            <h1 className="text-4xl md:text-7xl font-black uppercase tracking-tighter leading-none italic">Manage Tournaments</h1>
            <p className="text-sm font-medium text-muted-foreground leading-relaxed italic max-w-2xl">
              {isStarter
                ? 'Create basic tournaments with manual team entry. Upgrade to Pro for advanced formats, portals, and officiating tools.'
                : 'Elite-level institutional Series Architect for managing multi-field tournaments, synchronized officiating, and live bracket telemetry.'}
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex gap-2 justify-end">
              {hasArchived && (
                <Button variant="ghost" onClick={() => setShowArchived(!showArchived)} className="h-14 px-6 rounded-2xl border-2 font-black uppercase text-[10px] tracking-widest text-[#050505] bg-white hover:bg-muted flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {showArchived ? 'Active Mode' : 'Historical Data'}
                </Button>
              )}
              {(isStaff || isPrimaryClubAuthority) && (
                <Button onClick={() => setIsWizardOpen(true)} className="h-14 px-8 rounded-2xl bg-black hover:bg-black/90 text-white font-black uppercase text-xs shadow-2xl transition-all active:scale-95 shrink-0 flex items-center">
                  {isStarter ? 'Create Basic Tournament' : 'Assemble Elite Series'} <Plus className="ml-3 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </header>
      ) : (
        <div className="flex justify-end gap-2">
          {hasArchived && (
            <Button variant="ghost" onClick={() => setShowArchived(!showArchived)} className="h-11 px-5 rounded-2xl border-2 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {showArchived ? 'Active' : 'Archived'}
            </Button>
          )}
          {(isStaff || isPrimaryClubAuthority) && (
            <Button onClick={() => setIsWizardOpen(true)} className="h-11 px-6 rounded-2xl bg-black hover:bg-black/90 text-white font-black uppercase text-xs shadow-2xl flex items-center">
              {isStarter ? 'Create Basic Tournament' : 'Assemble Elite Series'} <Plus className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
        {groupedEvents.map((group) => {
          const hasDivisions = group.items.length > 1 || group.items.some(e => e.divisionTitle);
          
          if (!hasDivisions) {
            const event = group.items[0];
            return (
              <Card key={event.id} className="rounded-[2rem] border-none shadow-xl ring-1 ring-black/5 bg-white p-6 sm:p-10 space-y-6 sm:space-y-8 group hover:shadow-2xl transition-all cursor-pointer relative overflow-hidden" onClick={() => setSelectedEventId(event.id)}>
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-700 font-black italic text-8xl flex flex-col items-end pointer-events-none">
                   <Trophy className="h-32 w-32" />
                </div>
                <div className="relative z-10 space-y-4">
                  <div className="flex justify-between items-center">
                    <Badge variant="outline" className="border-2 font-black text-[9px] uppercase tracking-widest bg-white">
                      {event.sport || 'General'} Tournament
                    </Badge>
                    {event.isArchived && <Badge className="bg-amber-100 text-amber-700 border-none text-[8px] font-black uppercase px-2">Archived</Badge>}
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tight leading-tight group-hover:text-primary transition-colors break-words overflow-hidden text-left">{event.title}</h3>
                  <div className="flex flex-col gap-2 pt-4 text-left">
                    <div className="flex items-center gap-3 text-muted-foreground">
                       <CalendarDays className="h-4 w-4" />
                       <span className="text-[10px] font-black uppercase tracking-widest">
                         {event.endDate && event.endDate !== event.date 
                           ? `${format(new Date(event.date), 'MMMM d')} - ${format(new Date(event.endDate), 'd, yyyy')}`
                           : format(new Date(event.date), 'MMMM d, yyyy')}
                       </span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground"><MapPin className="h-4 w-4" /><span className="text-[10px] font-black uppercase tracking-widest truncate">{event.location}</span></div>
                  </div>
                </div>
                <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-muted/30 pt-8 text-left">
                   <div className="space-y-1"><p className="text-[8px] font-black uppercase opacity-40">Squads</p><p className="text-xl font-black">{(event.tournamentTeamsData || []).length}</p></div>
                   <div className="space-y-1"><p className="text-[8px] font-black uppercase opacity-40">Matches</p><p className="text-xl font-black">{(event.tournamentGames || []).length}</p></div>
                </div>
                <div className="flex flex-col gap-2 w-full">
                  <Button variant="ghost" className="w-full h-14 rounded-2xl border-2 font-black uppercase text-xs tracking-widest group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-all">Launch Hub <ChevronRight className="ml-2 h-4 w-4" /></Button>
                {(isStaff || isPrimaryClubAuthority) && (
                  <Button 
                    variant="outline" 
                    className="w-full h-14 px-6 rounded-2xl border-2 font-black uppercase text-[10px] tracking-widest hover:bg-black hover:text-white transition-all flex items-center justify-center gap-2" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setDuplicatingEvent(event);
                      setDuplicateTitle(`${event.title} (Clone)`);
                      setIsDuplicateOpen(true);
                    }}
                  >
                    <Copy className="h-4 w-4" /> Clone Series
                  </Button>
                )}
                </div>
              </Card>
            );
          }

          const primaryEvent = group.items[0];
          return (
            <Card 
              key={group.name} 
              className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white flex flex-col group transition-all col-span-1 sm:col-span-2 xl:col-span-3 border border-black/5"
            >
              <div className="h-2 bg-gradient-to-r from-primary to-orange-500 w-full" />
              <CardContent className="p-6 sm:p-8 lg:p-10 space-y-8 flex-1">
                <div className="flex justify-between items-start">
                  <div className="space-y-3 text-left">
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/5 p-4 rounded-[1.25rem] text-primary shadow-inner">
                        <Trophy className="h-7 w-7" />
                      </div>
                      <div>
                        <h3 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-black">{group.name}</h3>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                          {group.items.length} divisions active • {group.items.reduce((acc, curr) => acc + (curr.tournamentTeamsData || []).length, 0)} total squads
                        </p>
                      </div>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-black text-white border-none font-black text-[10px] h-7 px-4 shadow-lg uppercase">
                    {primaryEvent.sport || 'General'}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.items.map((divEvent) => {
                    const divisionName = divEvent.divisionTitle || "Main Division";
                    let badgeBg = "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20";
                    if (divisionName.toLowerCase().includes("gold") || divisionName.toLowerCase().includes("varsity")) {
                      badgeBg = "bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20";
                    } else if (divisionName.toLowerCase().includes("silver") || divisionName.toLowerCase().includes("jv") || divisionName.toLowerCase().includes("junior")) {
                      badgeBg = "bg-slate-400/10 text-slate-600 border-slate-400/20 hover:bg-slate-400/20";
                    } else if (divisionName.toLowerCase().includes("bronze") || divisionName.toLowerCase().includes("freshman")) {
                      badgeBg = "bg-orange-700/10 text-orange-700 border-orange-700/20 hover:bg-orange-700/20";
                    }
                    
                    return (
                      <div 
                        key={divEvent.id}
                        onClick={() => setSelectedEventId(divEvent.id)}
                        className="rounded-[1.75rem] border-2 border-black/5 hover:border-primary/20 bg-muted/5 hover:bg-primary/[0.02] p-5 space-y-4 transition-all duration-300 cursor-pointer flex flex-col justify-between group/div text-left"
                      >
                        <div className="space-y-3">
                          <div className="flex justify-between items-start gap-2">
                            <Badge className={`border font-black text-[9px] h-6 px-3 uppercase tracking-wider ${badgeBg}`}>
                              {divisionName}
                            </Badge>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                              {(divEvent.tournamentTeamsData || []).length} squads enrolled
                            </p>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                              {(divEvent.tournamentGames || []).length} matches
                            </p>
                          </div>
                        </div>
                        <div className="pt-3 border-t border-black/5 flex items-center justify-between gap-2">
                          <div className="flex gap-2">
                            {(isStaff || isPrimaryClubAuthority) && (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 px-3 rounded-lg border-2 font-black uppercase text-[8px] tracking-wider hover:bg-black hover:text-white transition-all"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDuplicatingEvent(divEvent);
                                  setDuplicateTitle(`${divEvent.title} (${divisionName} Clone)`);
                                  setIsDuplicateOpen(true);
                                }}
                              >
                                <Copy className="h-3 w-3 mr-1" /> Clone
                              </Button>
                            )}
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 rounded-lg text-[8px] font-black uppercase border border-primary/20 text-primary group-hover/div:bg-primary group-hover/div:text-white transition-all px-3"
                          >
                            Select Hub
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {isLoading && [1, 2, 3].map(i => <div key={i} className="h-80 rounded-[3rem] bg-muted/20 animate-pulse border-2 border-dashed" />)}
        {events?.length === 0 && !isLoading && (
          <div className="col-span-full py-40 text-center border-4 border-dashed rounded-[5rem] bg-muted/5 flex flex-col items-center">
            <div className="bg-primary/10 p-10 rounded-[3rem] text-primary mb-8 shadow-inner animate-pulse"><Trophy className="h-20 w-20" /></div>
            <h2 className="text-4xl font-black uppercase tracking-tighter mb-4 italic">The Arena is Empty</h2>
            <p className="text-muted-foreground uppercase text-xs font-black tracking-widest mb-10 italic">No elite series deployed in the current sector.</p>
            <Button onClick={() => setIsWizardOpen(true)} className="h-16 px-12 rounded-2xl font-black uppercase shadow-xl">Deploy First Series</Button>
          </div>
        )}
      </div>

      <TournamentDeploymentWizard isOpen={isWizardOpen} onOpenChange={setIsWizardOpen} onComplete={() => setSelectedEventId(null)} />

      <Dialog open={isDuplicateOpen} onOpenChange={setIsDuplicateOpen}>
        <DialogContent className="rounded-[4rem] sm:max-w-md p-0 overflow-hidden bg-black text-white border-none shadow-[0_0_100px_rgba(0,0,0,0.5)]">
          <div className="h-2 bg-primary w-full" />
          <div className="p-4 sm:p-12 space-y-10">
            <DialogHeader>
              <div className="flex items-center gap-4 mb-2">
                <div className="bg-primary/20 p-4 rounded-[1.5rem] text-primary"><Copy className="h-8 w-8" /></div>
                <div>
                   <DialogTitle className="text-4xl font-black uppercase tracking-tighter">Replicate Series</DialogTitle>
                   <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest mt-1">Clone Series Architecture & Logic</DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="space-y-6">
              <div className="space-y-3">
                 <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 ml-2">New Series Headline</Label>
                 <Input 
                   placeholder="e.g. Winter Invitational - Elite Tier" 
                   value={duplicateTitle} 
                   onChange={e => setDuplicateTitle(e.target.value)} 
                   className="h-20 rounded-[2rem] border-2 border-white/10 bg-white/5 font-black text-2xl px-8 focus:bg-white focus:text-black transition-all" 
                   autoFocus
                 />
              </div>
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest leading-relaxed italic px-2">
                Replicating clones all logistical metadata, locations, and registration protocols. 
                Participating squads and match history will be purged for the new iteration.
              </p>
            </div>
            <DialogFooter>
              <Button className="w-full h-20 rounded-[2rem] text-xl font-black bg-white text-black hover:bg-primary hover:text-white transition-all shadow-2xl" onClick={handleDuplicateTournament} disabled={isProcessing || !duplicateTitle.trim()}>
                {isProcessing ? <Loader2 className="h-8 w-8 animate-spin" /> : "Deploy Replicated Series"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ManageTournamentsPageGuard() {
  const { isStaff, isPrimaryClubAuthority } = useTeam();
  if (!isStaff && !isPrimaryClubAuthority) return <AccessRestricted />;
  return <ManageTournamentsPageContent />;
}

export default function ManageTournamentsPage() {
  return <ManageTournamentsPageGuard />;
}

function ScorekeeperCodeEditor({ event }: { event: any }) {
  const { db } = useTeam();
  const [code, setCode] = useState((event as any).scoringCode || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!db || !event.teamId) return;
    const normalizedCode = code.trim();
    if (normalizedCode.length < 4) {
      toast({ title: 'Code Required', description: 'Use at least 4 characters for scorekeeper access.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      await updateDoc(doc(db, 'teams', event.teamId, 'events', event.id), { scoringCode: normalizedCode });
      toast({ title: 'Scorekeeper Code Updated', description: 'Score submissions now require this code.' });
    } catch {
      toast({ title: 'Update Failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="Set scorekeeper access code..."
            className="w-full h-14 pl-10 pr-4 rounded-2xl bg-white/10 border border-white/20 text-white font-black text-sm uppercase tracking-widest outline-none focus:border-primary placeholder:text-white/20 placeholder:uppercase placeholder:font-bold placeholder:text-xs"
          />
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="h-14 px-8 rounded-2xl bg-primary text-white font-black uppercase text-xs tracking-widest shadow-xl"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
        </Button>
      </div>
      <p className="text-[9px] font-bold text-white/25 uppercase tracking-widest pl-1">
        Scorekeepers must enter this code to submit match results. Leave blank for open access.
      </p>
    </div>
  );
}
