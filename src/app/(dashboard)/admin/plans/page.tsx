
"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useTeam, Plan, Feature } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import { 
  Settings, 
  ShieldCheck, 
  Trash2, 
  Plus, 
  Check, 
  AlertTriangle,
  Globe,
  Lock,
  Save,
  Loader2,
  Users,
  Trophy,
  Zap,
  Building
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getPlanTeamLimit } from '@/lib/plan-catalog';

export default function AdminPlansPage() {
  const { isSuperAdmin, plans, assignManualPlan } = useTeam();
  const db = useFirestore();
  
  const featuresQuery = useMemoFirebase(() => db ? collection(db, 'features') : null, [db]);
  const { data: featuresRaw } = useCollection(featuresQuery);
  const features = useMemo(() => (featuresRaw || []) as Feature[], [featuresRaw]);

  const [editingPlan, setEditingPlan] = useState<Partial<Plan> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Manual Provisioning State
  const [targetUid, setTargetUid] = useState('');
  const [provisionPlanId, setProvisionPlanId] = useState('school');
  const [isProvisioning, setIsProvisioning] = useState(false);

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-6">
        <ShieldCheck className="h-16 w-16 text-muted-foreground opacity-20" />
        <h1 className="text-3xl font-black uppercase tracking-tight">Access Restricted</h1>
        <p className="text-muted-foreground font-bold">This management suite is reserved for platform administrators.</p>
      </div>
    );
  }

  const handleSavePlan = async () => {
    if (!editingPlan?.id || !db) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'plans', editingPlan.id), editingPlan, { merge: true });
      toast({ title: "Plan Synchronized", description: `${editingPlan.name} updated globally.` });
      setEditingPlan(null);
    } catch (e) {
      toast({ title: "Error", description: "Failed to save plan details.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualProvision = async () => {
    if (!targetUid.trim()) return;
    setIsProvisioning(true);
    await assignManualPlan(targetUid, provisionPlanId, getPlanTeamLimit(provisionPlanId));
    setIsProvisioning(false);
    setTargetUid('');
  };

  const toggleFeature = (featureId: string) => {
    if (!editingPlan) return;
    const currentFeatures = editingPlan.features || {};
    setEditingPlan({
      ...editingPlan,
      features: {
        ...currentFeatures,
        [featureId]: !currentFeatures[featureId]
      }
    });
  };

  return (
    <div className="space-y-10 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black tracking-tighter uppercase">Platform Economy</h1>
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Manage subscription tiers and manual organization overrides</p>
        </div>
      </div>

      <Tabs defaultValue="catalog" className="space-y-8">
        <TabsList className="bg-muted/50 rounded-xl p-1 h-12 inline-flex border-2">
          <TabsTrigger value="catalog" className="rounded-lg font-black text-xs uppercase tracking-widest px-8 data-[state=active]:bg-primary data-[state=active]:text-white">Global Catalog</TabsTrigger>
          <TabsTrigger value="provisioning" className="rounded-lg font-black text-xs uppercase tracking-widest px-8 data-[state=active]:bg-primary data-[state=active]:text-white">User Provisioning</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="space-y-10 mt-0">
          <div className="flex justify-end">
            <Button className="rounded-full h-12 px-8 font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20" onClick={() => setEditingPlan({ id: 'new_plan_' + Date.now(), name: 'New Tier', features: {}, isPublic: true, isContactOnly: false, billingType: 'monthly', proTeamLimit: 1 })}>
              <Plus className="h-4 w-4 mr-2" /> Create New Plan
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {plans.map((plan) => (
              <Card key={plan.id} className={cn("rounded-[2.5rem] border-none shadow-xl overflow-hidden ring-1 ring-black/5 transition-all", editingPlan?.id === plan.id ? "ring-4 ring-primary scale-[1.02]" : "hover:scale-[1.01]")}>
                <div className={cn("h-2 w-full", plan.billingType === 'free' ? "bg-muted" : "bg-primary")} />
                <CardHeader className="p-8 pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-2xl font-black tracking-tight">{plan.name}</CardTitle>
                      <Badge variant="outline" className="mt-1 text-[9px] font-black uppercase tracking-widest border-primary/20 text-primary">
                        {plan.billingType}
                      </Badge>
                    </div>
                    {plan.isContactOnly ? <Lock className="h-4 w-4 text-muted-foreground" /> : <Globe className="h-4 w-4 text-primary" />}
                  </div>
                  <CardDescription className="font-medium pt-2 line-clamp-2">{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="p-8 pt-4 space-y-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black">{plan.priceDisplay}</span>
                    <span className="text-xs font-bold text-muted-foreground uppercase">{plan.billingCycle}</span>
                  </div>
                  <div className="pt-4 space-y-2">
                    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Core Metrics</p>
                    <div className="flex justify-between text-xs font-bold">
                      <span>Pro Team Limit</span>
                      <span className="text-primary font-black">{plan.proTeamLimit}</span>
                    </div>
                    <div className="flex justify-between text-xs font-bold">
                      <span>Enabled Features</span>
                      <span>{Object.values(plan.features || {}).filter(v => v).length}</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="p-8 pt-0">
                  <Button variant="outline" className="w-full h-12 rounded-xl font-black uppercase text-xs tracking-widest border-2" onClick={() => setEditingPlan(plan)}>
                    Edit Configuration
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>

          {editingPlan && (
            <Card className="rounded-[3rem] border-none shadow-2xl ring-4 ring-primary/10 overflow-hidden animate-in fade-in slide-in-from-bottom-8">
              <CardHeader className="bg-primary/5 p-10 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <Badge className="bg-primary text-white mb-2 font-black uppercase tracking-widest text-[9px]">Plan Architect</Badge>
                    <CardTitle className="text-4xl font-black tracking-tight uppercase">Configuring: {editingPlan.name}</CardTitle>
                  </div>
                  <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setEditingPlan(null)}><Plus className="h-6 w-6 rotate-45" /></Button>
                </div>
              </CardHeader>
              <CardContent className="p-10">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                  <div className="space-y-8">
                    <div className="space-y-6">
                      <h3 className="text-xs font-black uppercase tracking-[0.3em] text-primary px-1">Identity & Logistics</h3>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Plan Name</Label>
                          <Input value={editingPlan.name} onChange={e => setEditingPlan({...editingPlan, name: e.target.value})} className="h-12 rounded-xl font-bold border-2" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Billing Type</Label>
                          <Input value={editingPlan.billingType} onChange={e => setEditingPlan({...editingPlan, billingType: e.target.value as any})} className="h-12 rounded-xl font-bold border-2" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Price Display</Label>
                          <Input value={editingPlan.priceDisplay} onChange={e => setEditingPlan({...editingPlan, priceDisplay: e.target.value})} className="h-12 rounded-xl font-bold border-2" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Billing Cycle</Label>
                          <Input value={editingPlan.billingCycle} onChange={e => setEditingPlan({...editingPlan, billingCycle: e.target.value})} className="h-12 rounded-xl font-bold border-2" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Pro Team Quota</Label>
                          <Input type="number" value={editingPlan.proTeamLimit || ''} onChange={e => setEditingPlan({...editingPlan, proTeamLimit: parseInt(e.target.value) || 0})} className="h-12 rounded-xl font-bold border-2" />
                        </div>
                      </div>
                      <div className="flex gap-8 pt-4">
                        <div className="flex items-center space-x-3">
                          <Switch checked={editingPlan.isPublic} onCheckedChange={v => setEditingPlan({...editingPlan, isPublic: v})} />
                          <Label className="text-xs font-black uppercase tracking-widest">Public Catalog</Label>
                        </div>
                        <div className="flex items-center space-x-3">
                          <Switch checked={editingPlan.isContactOnly} onCheckedChange={v => setEditingPlan({...editingPlan, isContactOnly: v})} />
                          <Label className="text-xs font-black uppercase tracking-widest">Contact Only</Label>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h3 className="text-xs font-black uppercase tracking-[0.3em] text-primary px-1">Capability Matrix</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-4 custom-scrollbar">
                      {features.map((feature) => (
                        <div 
                          key={feature.id} 
                          className={cn(
                            "flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer group",
                            editingPlan.features?.[feature.id] ? "bg-primary/5 border-primary ring-1 ring-primary/20" : "bg-muted/30 border-transparent hover:border-muted"
                          )}
                          onClick={() => toggleFeature(feature.id)}
                        >
                          <div className="min-w-0 pr-4">
                            <p className="text-[10px] font-black tracking-tight leading-tight truncate uppercase">{feature.id.replace(/_/g, ' ')}</p>
                            <p className="text-[8px] font-medium text-muted-foreground line-clamp-1 group-hover:line-clamp-none">{feature.description}</p>
                          </div>
                          <div className={cn("h-5 w-5 rounded-full flex items-center justify-center shrink-0", editingPlan.features?.[feature.id] ? "bg-primary text-white" : "bg-white border-2")}>
                            {editingPlan.features?.[feature.id] && <Check className="h-3 w-3 stroke-[4px]" />}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="p-10 bg-muted/10 border-t flex gap-4">
                <Button className="flex-1 h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20" onClick={handleSavePlan} disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-6 w-6 animate-spin" /> : <Save className="h-6 w-6 mr-3" />}
                  Commit Global Plan Configuration
                </Button>
                <Button variant="outline" className="h-16 px-10 rounded-2xl font-black uppercase tracking-widest text-[10px] border-2" onClick={() => setEditingPlan(null)}>Cancel</Button>
              </CardFooter>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="provisioning" className="mt-0">
          <Card className="rounded-[3rem] border-none shadow-2xl overflow-hidden ring-1 ring-black/5 bg-white">
            <CardHeader className="bg-black text-white p-10">
              <div className="flex items-center gap-6">
                <div className="bg-primary p-4 rounded-2xl shadow-xl shadow-primary/20">
                  <Building className="h-8 w-8 text-white" />
                </div>
                <div>
                  <CardTitle className="text-3xl font-black tracking-tight uppercase leading-none">User Quota Provisioning</CardTitle>
                  <CardDescription className="text-white/60 font-bold uppercase tracking-widest text-[10px] mt-2">Manual organization overrides & enterprise seat assignment</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-10">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                <div className="space-y-8">
                  <div className="space-y-6">
                    <h3 className="text-xs font-black uppercase tracking-[0.3em] text-primary px-1">Assignment Parameters</h3>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Target User UID</Label>
                        <Input 
                          placeholder="Paste User UID from Firebase Auth..." 
                          value={targetUid} 
                          onChange={e => setTargetUid(e.target.value)} 
                          className="h-14 rounded-xl border-2 font-mono text-xs" 
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Pro Team Quota</Label>
                          <Input 
                            type="number" 
                            value={getPlanTeamLimit(provisionPlanId)}
                            readOnly
                            className="h-14 rounded-xl border-2 font-black text-lg" 
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Entitlement Tier</Label>
                          <select 
                            value={provisionPlanId} 
                            onChange={e => setProvisionPlanId(e.target.value)}
                            className="w-full h-14 rounded-xl border-2 bg-background px-3 font-bold text-sm focus:ring-2 focus:ring-primary outline-none"
                          >
                            <option value="free">Free</option>
                            <option value="team">Team</option>
                            <option value="elite">Elite</option>
                            <option value="league">League</option>
                            <option value="school">School</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-primary/5 p-8 rounded-[2.5rem] border-2 border-dashed border-primary/20 space-y-4">
                    <div className="flex items-center gap-3">
                      <ShieldCheck className="h-5 w-5 text-primary" />
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Provisioning Rules</h4>
                    </div>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-3 text-[10px] font-medium leading-relaxed">
                        <Check className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                        <span>Source will be set to <strong>'manual'</strong> to prevent standard billing overrides.</span>
                      </li>
                      <li className="flex items-start gap-3 text-[10px] font-medium leading-relaxed">
                        <Check className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                        <span>Entitlement takes effect immediately upon the user's next session.</span>
                      </li>
                      <li className="flex items-start gap-3 text-[10px] font-medium leading-relaxed">
                        <Check className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                        <span>This does <strong>not</strong> trigger a credit card charge. Billing must be handled off-platform.</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="flex flex-col justify-center items-center text-center space-y-6 bg-muted/20 rounded-[3rem] p-10 border-2 border-dashed border-muted-foreground/10">
                  <div className="bg-white p-6 rounded-[2rem] shadow-xl relative">
                    <Users className="h-16 w-16 text-muted-foreground opacity-20" />
                    <Zap className="absolute -top-2 -right-2 h-8 w-8 text-amber-500 animate-pulse" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-xl font-black uppercase tracking-tight">Ready to Provision?</h4>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest max-w-xs leading-relaxed">
                      Assigned limits enable organization-wide scaling for Elite Squad coordination.
                    </p>
                  </div>
                  <Button 
                    className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all"
                    onClick={handleManualProvision}
                    disabled={!targetUid.trim() || isProvisioning}
                  >
                    {isProvisioning ? <Loader2 className="h-6 w-6 animate-spin mr-3" /> : <Plus className="h-6 w-6 mr-3" />}
                    Assign Enterprise Quota
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
