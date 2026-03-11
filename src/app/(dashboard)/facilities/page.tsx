
"use client";

import React, { useState, useMemo } from 'react';
import { useTeam, Facility, Field, TeamEvent } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  MapPin, 
  Plus, 
  Trash2, 
  CalendarDays, 
  Settings, 
  Loader2, 
  Globe, 
  Info,
  Table as TableIcon,
  ChevronRight,
  Clock,
  LayoutGrid
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';

function FacilityFieldManager({ facility }: { facility: Facility }) {
  const { addField, deleteField, isSuperAdmin, user } = useTeam();
  const db = useFirestore();
  const [newFieldName, setNewFieldName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const fieldsQuery = useMemoFirebase(() => {
    if (!db || !facility.id) return null;
    return query(collection(db, 'facilities', facility.id, 'fields'), orderBy('name', 'asc'));
  }, [db, facility.id]);

  const { data: fields } = useCollection<Field>(fieldsQuery);

  const handleAddField = async () => {
    if (!newFieldName.trim()) return;
    setIsProcessing(true);
    await addField(facility.id, newFieldName);
    setNewFieldName('');
    setIsProcessing(false);
    toast({ title: "Field Enrolled", description: `${newFieldName} added to ${facility.name}.` });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Active Fields/Courts</p>
        <Badge variant="outline" className="text-[8px] font-black">{fields?.length || 0} TOTAL</Badge>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {fields?.map(field => (
          <div key={field.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl border border-transparent hover:border-primary/10 transition-all group">
            <span className="text-xs font-black uppercase truncate">{field.name}</span>
            {(facility.clubId === user?.id || isSuperAdmin) && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100" onClick={() => deleteField(facility.id, field.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
        {(!fields || fields.length === 0) && <p className="text-[9px] font-bold text-muted-foreground italic text-center py-2">No fields established.</p>}
      </div>
      <div className="flex gap-2 pt-2">
        <Input 
          placeholder="New field name..." 
          value={newFieldName} 
          onChange={e => setNewFieldName(e.target.value)} 
          className="h-9 rounded-xl text-xs font-bold"
        />
        <Button size="sm" onClick={handleAddField} disabled={isProcessing || !newFieldName.trim()} className="h-9 rounded-xl px-4 font-black uppercase text-[10px]">
          Add
        </Button>
      </div>
    </div>
  );
}

export default function FacilityManagementPage() {
  const { user, isStaff, addFacility, deleteFacility, isSuperAdmin } = useTeam();
  const db = useFirestore();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newFac, setNewFac] = useState({ name: '', address: '', notes: '' });
  const [isProcessing, setIsProcessing] = useState(false);

  const facilitiesQuery = useMemoFirebase(() => {
    if (!db || !user?.id) return null;
    return query(collection(db, 'facilities'), where('clubId', '==', user.id));
  }, [db, user?.id]);

  const { data: facilities, isLoading } = useCollection<Facility>(facilitiesQuery);

  const handleAddFacility = async () => {
    if (!newFac.name || !newFac.address) return;
    setIsProcessing(true);
    await addFacility(newFac);
    setNewFac({ name: '', address: '', notes: '' });
    setIsAddOpen(false);
    setIsProcessing(false);
    toast({ title: "Facility Established", description: `${newFac.name} is now live.` });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Opening Logistics Hub...</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[9px] h-6 px-3">Master Infrastructure</Badge>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-none">Facilities</h1>
          <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px] ml-1">Asset Scheduling & Venue Coordination</p>
        </div>

        {isStaff && (
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="h-14 px-8 rounded-2xl text-lg font-black shadow-xl shadow-primary/20">
                <Plus className="h-5 w-5 mr-2" /> Enroll Facility
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-[2.5rem] sm:max-w-md border-none shadow-2xl">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black tracking-tight uppercase">Facility Registration</DialogTitle>
                <DialogDescription className="font-bold text-primary uppercase tracking-widest text-[10px]">Onboard a new athletic venue</DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Venue Name</Label>
                  <Input placeholder="e.g. Metro Sports Complex" value={newFac.name} onChange={e => setNewFac({...newFac, name: e.target.value})} className="h-12 rounded-xl font-bold border-2" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Physical Address</Label>
                  <Input placeholder="123 Stadium Way..." value={newFac.address} onChange={e => setNewFac({...newFac, address: e.target.value})} className="h-12 rounded-xl font-bold border-2" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Operational Notes</Label>
                  <Input placeholder="Parking, gate codes, etc." value={newFac.notes} onChange={e => setNewFac({...newFac, notes: e.target.value})} className="h-12 rounded-xl font-bold border-2" />
                </div>
              </div>
              <DialogFooter>
                <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={handleAddFacility} disabled={isProcessing || !newFac.name}>
                  Log Facility
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {facilities?.map((facility) => (
          <Card key={facility.id} className="rounded-[3rem] border-none shadow-2xl overflow-hidden ring-1 ring-black/5 bg-white flex flex-col group">
            <div className="h-2 hero-gradient w-full" />
            <CardContent className="p-8 space-y-8 flex-1">
              <div className="flex justify-between items-start">
                <div className="bg-primary/5 p-5 rounded-[1.5rem] text-primary shadow-inner">
                  <MapPin className="h-10 w-10" />
                </div>
                {(facility.clubId === user?.id || isSuperAdmin) && (
                  <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/5 rounded-xl h-10 w-10" onClick={() => deleteFacility(facility.id)}>
                    <Trash2 className="h-5 w-5" />
                  </Button>
                )}
              </div>
              
              <div className="space-y-2">
                <h3 className="text-3xl font-black uppercase tracking-tight group-hover:text-primary transition-colors leading-none">{facility.name}</h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-relaxed flex items-center gap-2">
                  <Globe className="h-3 w-3" /> {facility.address}
                </p>
              </div>

              <FacilityFieldManager facility={facility} />

              <div className="pt-4 border-t space-y-4">
                <div className="bg-primary/5 p-4 rounded-2xl border-2 border-dashed border-primary/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Info className="h-3 w-3 text-primary" />
                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-primary">Logistics Memo</span>
                  </div>
                  <p className="text-[10px] font-medium leading-relaxed italic text-muted-foreground">
                    {facility.notes || 'Professional athletic facility logged in organization reserves.'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {facilities?.length === 0 && (
          <div className="col-span-full py-32 text-center border-2 border-dashed rounded-[3rem] bg-muted/10 opacity-40">
            <LayoutGrid className="h-16 w-16 mx-auto mb-4" />
            <p className="text-sm font-black uppercase tracking-widest">No organization facilities enrolled yet.</p>
          </div>
        )}
      </div>

      <Card className="rounded-[3rem] border-none shadow-2xl bg-black text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none">
          <CalendarDays className="h-48 w-48" />
        </div>
        <CardContent className="p-12 relative z-10 space-y-6">
          <Badge className="bg-primary text-white border-none font-black text-[10px] px-4 h-7">Conflict Resolution</Badge>
          <h2 className="text-4xl font-black tracking-tight leading-tight uppercase">Master Scheduling</h2>
          <p className="text-white/60 font-medium text-lg leading-relaxed max-w-2xl">
            Facility management ensures your organization never encounters field conflicts. Select a venue and field during event deployment to automatically verify availability across all squads in your club.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
