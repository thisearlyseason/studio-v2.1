"use client";

import React, { useState, useMemo } from 'react';
import { useTeam, Facility, Field } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LocationAutocomplete } from '@/components/ui/LocationAutocomplete';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { 
  MapPin, Plus, Trash2, CalendarDays, Loader2, Globe, Info,
  LayoutGrid, Building, AlertCircle, Zap, Pencil, Check, X
} from 'lucide-react';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AccessRestricted } from '@/components/layout/AccessRestricted';

function FacilityFieldManager({ facility }: { facility: Facility }) {
  const { addField, updateField, deleteField, isSuperAdmin, firebaseUser } = useTeam();
  const db = useFirestore();
  const [newFieldName, setNewFieldName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editingFieldName, setEditingFieldName] = useState('');
  const [savingFieldId, setSavingFieldId] = useState<string | null>(null);
  const [deletingFieldId, setDeletingFieldId] = useState<string | null>(null);

  const fieldsQuery = useMemoFirebase(() => {
    if (!db || !facility.id) return null;
    return query(collection(db, 'facilities', facility.id, 'fields'), orderBy('name', 'asc'));
  }, [db, facility.id]);

  const { data: fields } = useCollection<Field>(fieldsQuery);
  const canManage = facility.clubId === firebaseUser?.uid || isSuperAdmin;

  const handleAddField = async () => {
    const fieldName = newFieldName.trim();
    if (!fieldName) return;
    setIsProcessing(true);
    try {
      await addField(facility.id, fieldName);
      setNewFieldName('');
      toast({ title: "Field Enrolled", description: `${fieldName} added to ${facility.name}.` });
    } catch (error: any) {
      toast({
        title: 'Resource Creation Failed',
        description: error.message || 'Could not add this field or court.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const beginRename = (field: Field) => {
    setEditingFieldId(field.id);
    setEditingFieldName(field.name);
  };

  const cancelRename = () => {
    setEditingFieldId(null);
    setEditingFieldName('');
  };

  const handleRenameField = async (field: Field) => {
    const nextName = editingFieldName.trim();
    if (!nextName || nextName === field.name) {
      cancelRename();
      return;
    }

    setSavingFieldId(field.id);
    try {
      await updateField(facility.id, field.id, nextName);
      toast({
        title: 'Resource Renamed',
        description: `${field.name} is now ${nextName} everywhere it is scheduled or displayed.`,
      });
      cancelRename();
    } catch (error: any) {
      toast({
        title: 'Rename Failed',
        description: error.message || 'Could not rename this facility resource.',
        variant: 'destructive',
      });
    } finally {
      setSavingFieldId(null);
    }
  };

  const handleDeleteField = async (field: Field) => {
    const confirmed = window.confirm(
      `Delete "${field.name}" from ${facility.name}? This will only continue if it is not used by any event, tournament, or league schedule.`
    );
    if (!confirmed) return;

    setDeletingFieldId(field.id);
    try {
      await deleteField(facility.id, field.id);
      toast({
        title: 'Resource Deleted',
        description: `${field.name} was removed from ${facility.name}.`,
      });
    } catch (error: any) {
      toast({
        title: 'Resource Still In Use',
        description: error.message || 'Could not safely delete this facility resource.',
        variant: 'destructive',
      });
    } finally {
      setDeletingFieldId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Active Fields/Courts</p>
          {canManage && (
            <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-muted-foreground/70">
              Select Edit to rename a resource
            </p>
          )}
        </div>
        <Badge variant="outline" className="text-[8px] font-black">{fields?.length || 0} TOTAL</Badge>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {fields?.map(field => {
          const isEditing = editingFieldId === field.id;
          const isSaving = savingFieldId === field.id;
          return (
            <div key={field.id} className="flex items-center justify-between gap-2 p-3 bg-muted/30 rounded-xl border border-transparent hover:border-primary/10 transition-all group">
              {isEditing ? (
                <Input
                  autoFocus
                  value={editingFieldName}
                  onChange={event => setEditingFieldName(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') handleRenameField(field);
                    if (event.key === 'Escape') cancelRename();
                  }}
                  className="h-8 rounded-lg text-xs font-black uppercase"
                  maxLength={120}
                  aria-label={`Rename ${field.name}`}
                />
              ) : (
                <span className="text-xs font-black uppercase truncate">{field.name}</span>
              )}

              {canManage && (
                <div className="flex items-center shrink-0">
                  {isEditing ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 text-primary"
                        onClick={() => handleRenameField(field)}
                        disabled={isSaving || !editingFieldName.trim()}
                        aria-label={`Save ${field.name} name`}
                      >
                        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 text-muted-foreground"
                        onClick={cancelRename}
                        disabled={isSaving}
                        aria-label="Cancel resource rename"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-10 rounded-xl px-3 text-[9px] font-black uppercase tracking-wider text-primary"
                            onClick={() => beginRename(field)}
                            aria-label={`Rename ${field.name}`}
                          >
                            <Pencil className="mr-1.5 h-3.5 w-3.5" />
                            Edit
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Rename Resource</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 text-destructive opacity-70 group-hover:opacity-100"
                            onClick={() => handleDeleteField(field)}
                            disabled={deletingFieldId === field.id}
                            aria-label={`Delete ${field.name}`}
                          >
                            {deletingFieldId === field.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Destroy Resource</TooltipContent>
                      </Tooltip>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {(!fields || fields.length === 0) && (
          <div className="bg-amber-50 p-4 rounded-xl border-2 border-dashed border-amber-200 flex flex-col items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            <p className="text-[9px] font-bold text-amber-700 uppercase text-center leading-tight">
              Action Required: Establish active fields/courts below to enable scheduling.
            </p>
          </div>
        )}
      </div>
      <div className="flex gap-2 pt-2">
        <Input 
          placeholder="e.g. Field A, Court 1..." 
          value={newFieldName} 
          onChange={e => setNewFieldName(e.target.value)} 
          onKeyDown={e => e.key === 'Enter' && handleAddField()}
          className="h-10 rounded-xl text-xs font-bold"
          maxLength={120}
        />
        <Button size="sm" onClick={handleAddField} disabled={isProcessing || !newFieldName.trim()} className="h-10 rounded-xl px-4 font-black uppercase text-[10px]">
          Add Resource
        </Button>
      </div>
    </div>
  );
}

function EditFacilityDialog({ facility }: { facility: Facility }) {
  const { updateFacility, isStaff } = useTeam();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: facility.name, address: facility.address || '', notes: facility.notes || '' });
  const [saving, setSaving] = useState(false);

  // Sync form whenever dialog opens so it always reflects latest data
  const handleOpenChange = (val: boolean) => {
    if (val) setForm({ name: facility.name, address: facility.address || '', notes: facility.notes || '' });
    setOpen(val);
  };

  // Any staff member can edit — Firestore rules enforce the actual security
  if (!isStaff) return null;

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const nextName = form.name.trim();
    try {
      await updateFacility(facility.id, {
        name: nextName,
        address: form.address.trim(),
        notes: form.notes.trim(),
      });
      setOpen(false);
      toast({
        title: 'Facility Updated',
        description: `${nextName} was updated everywhere this facility is linked or displayed.`,
      });
    } catch (error: any) {
      toast({
        title: 'Update Failed',
        description: error.message || 'Could not update this facility.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="text-primary hover:bg-primary/5 rounded-xl h-10 w-10">
              <Pencil className="h-4 w-4" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Edit Facility</TooltipContent>
      </Tooltip>
      <DialogContent className="rounded-[3rem] sm:max-w-xl p-0 border-none shadow-2xl overflow-hidden bg-white text-foreground">
        <DialogTitle className="sr-only">Edit Facility</DialogTitle>
        <div className="h-2 bg-primary w-full" />
        <div className="p-8 lg:p-12 space-y-8">
          <DialogHeader>
            <div className="flex items-center gap-4 mb-2">
              <div className="bg-primary/10 p-3 rounded-2xl text-primary">
                <Building className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-3xl font-black uppercase tracking-tight">Edit Facility</DialogTitle>
                <DialogDescription className="font-bold text-primary uppercase tracking-widest text-[10px]">Update venue details</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Venue Name</Label>
              <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="h-14 rounded-2xl font-bold border-2" placeholder="e.g. Metro Sports Complex" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Physical Address</Label>
              <LocationAutocomplete
                value={form.address}
                onChange={(val) => setForm({...form, address: val})}
                placeholder="123 Stadium Way, City, State…"
                inputClassName="h-14 rounded-2xl font-bold border-2"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Operational Notes</Label>
              <Input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="h-14 rounded-2xl font-bold border-2" placeholder="Parking, gate codes, etc." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="flex-1 h-14 rounded-2xl font-black">Cancel</Button>
            <Button className="flex-1 h-14 rounded-2xl font-black shadow-xl shadow-primary/20" onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Check className="h-5 w-5 mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function FacilityManagementPage() {
  const { isStaff, isSuperAdmin, activeTeam, firebaseUser } = useTeam();

  const ownsFacilityScope = isSuperAdmin || !activeTeam || activeTeam.ownerUserId === firebaseUser?.uid;
  if (!isStaff || !ownsFacilityScope) {
    return <AccessRestricted type="role" title="Facilities Access Restricted" description="Facility records and private access notes are managed by the squad owner." />;
  }

  return <AuthorizedFacilityManagementPage />;
}

function AuthorizedFacilityManagementPage() {
  const { isStaff, addFacility, deleteFacility, firebaseUser } = useTeam();

  const db = useFirestore();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newFac, setNewFac] = useState({ name: '', address: '', notes: '' });
  const [isProcessing, setIsProcessing] = useState(false);
  const [deletingFacilityId, setDeletingFacilityId] = useState<string | null>(null);

  const facilitiesQuery = useMemoFirebase(() => {
    if (!db || !firebaseUser?.uid) return null;
    return query(collection(db, 'facilities'), where('clubId', '==', firebaseUser.uid));
  }, [db, firebaseUser?.uid]);

  const { data: facilities, isLoading } = useCollection<Facility>(facilitiesQuery);

  if (!isStaff) return <AccessRestricted type="role" />;

  const handleAddFacility = async () => {
    if (!newFac.name || !newFac.address) return;
    setIsProcessing(true);
    await addFacility(newFac);
    setNewFac({ name: '', address: '', notes: '' });
    setIsAddOpen(false);
    setIsProcessing(false);
    toast({ title: "Facility Established", description: `${newFac.name} is now live.` });
  };

  const handleDeleteFacility = async (facility: Facility) => {
    const confirmed = window.confirm(
      `Decommission "${facility.name}"? Its fields and courts will also be deleted. This will only continue if none are used by an event, tournament, or league schedule.`
    );
    if (!confirmed) return;

    setDeletingFacilityId(facility.id);
    try {
      await deleteFacility(facility.id);
      toast({
        title: 'Facility Decommissioned',
        description: `${facility.name} and its unlinked resources were removed.`,
      });
    } catch (error: any) {
      toast({
        title: error.message?.toLowerCase().includes('still in use')
          ? 'Facility Still In Use'
          : 'Facility Deletion Failed',
        description: error.message || 'Could not safely delete this facility.',
        variant: 'destructive',
      });
    } finally {
      setDeletingFacilityId(null);
    }
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
          <Badge className="bg-primary/10 text-primary border-none font-black tracking-widest text-[9px] h-6 px-3 shadow-sm">Master Infrastructure</Badge>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-none text-foreground">Facilities</h1>
          <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px] ml-1">Asset Scheduling &amp; Venue Coordination</p>
        </div>

        {isStaff && (
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="h-14 px-8 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 transition-all active:scale-95">
                <Plus className="h-5 w-5 mr-2" /> Enroll Facility
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-[3rem] sm:max-w-xl p-0 border-none shadow-2xl overflow-hidden bg-white text-foreground">
              <DialogTitle className="sr-only">Facility Registration</DialogTitle>
              <div className="h-2 bg-primary w-full" />
              <div className="p-8 lg:p-12 space-y-10">
                <DialogHeader>
                  <div className="flex items-center gap-4 mb-2">
                    <div className="bg-primary/10 p-3 rounded-2xl text-primary">
                      <Building className="h-6 w-6" />
                    </div>
                    <div>
                      <DialogTitle className="text-3xl font-black uppercase tracking-tight">Facility Registration</DialogTitle>
                      <DialogDescription className="font-bold text-primary uppercase tracking-widest text-[10px]">Onboard a new athletic venue</DialogDescription>
                    </div>
                  </div>
                </DialogHeader>
                <div className="space-y-6">
                  <Alert variant="destructive" className="bg-amber-50 border-amber-200 text-amber-800">
                    <Zap className="h-4 w-4 text-amber-600" />
                    <AlertTitle className="font-black uppercase text-[10px] tracking-widest">Protocol Notice</AlertTitle>
                    <AlertDescription className="text-[11px] font-bold">
                      After enrolling a facility, you MUST add active fields, courts, or rooms to its profile to make it available for seasonal match scheduling.
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Venue Name</Label>
                    <Input placeholder="e.g. Metro Sports Complex" value={newFac.name} onChange={e => setNewFac({...newFac, name: e.target.value})} className="h-14 rounded-2xl font-bold border-2" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Physical Address</Label>
                    <LocationAutocomplete
                      value={newFac.address}
                      onChange={(val) => setNewFac({...newFac, address: val})}
                      placeholder="123 Stadium Way, City, State…"
                      inputClassName="h-14 rounded-2xl font-bold border-2"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Operational Notes</Label>
                    <Input placeholder="Parking, gate codes, etc." value={newFac.notes} onChange={e => setNewFac({...newFac, notes: e.target.value})} className="h-14 rounded-2xl font-bold border-2" />
                  </div>
                </div>
                <DialogFooter className="pt-4">
                  <Button className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl shadow-primary/20 active:scale-[0.98] transition-all" onClick={handleAddFacility} disabled={isProcessing || !newFac.name}>
                    {isProcessing ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : "Commit Facility Enrollment"}
                  </Button>
                </DialogFooter>
              </div>
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
                {isStaff && (
                  <div className="flex items-center gap-1">
                    <EditFacilityDialog facility={facility} />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:bg-destructive/5 rounded-xl h-10 w-10"
                          onClick={() => handleDeleteFacility(facility)}
                          disabled={deletingFacilityId === facility.id}
                          aria-label={`Decommission ${facility.name}`}
                        >
                          {deletingFacilityId === facility.id ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <Trash2 className="h-5 w-5" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Decommission Facility</TooltipContent>
                    </Tooltip>
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <h3 className="text-3xl font-black uppercase tracking-tight group-hover:text-primary transition-colors leading-none text-foreground">{facility.name}</h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-relaxed flex items-center gap-2">
                  <Globe className="h-3 w-3" /> {facility.address || 'No address set'}
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
            <p className="text-sm font-black uppercase tracking-widest text-foreground">No organization facilities enrolled yet.</p>
          </div>
        )}
      </div>

      <Card className="rounded-[3rem] border-none shadow-2xl bg-black text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none">
          <CalendarDays className="h-48 w-48" />
        </div>
        <CardContent className="p-12 relative z-10 space-y-6">
          <Badge className="bg-primary text-white border-none font-black text-[10px] px-4 h-7 uppercase tracking-widest">Conflict Resolution</Badge>
          <h2 className="text-4xl font-black tracking-tight leading-tight uppercase">Master Scheduling</h2>
          <p className="text-white/60 font-medium text-lg leading-relaxed max-w-2xl">
            Facility management ensures your organization never encounters field conflicts. Select a venue and field during event deployment to automatically verify availability across all squads in your club.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
