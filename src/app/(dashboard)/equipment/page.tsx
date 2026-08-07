"use client";

import React, { useState, useMemo } from 'react';
import { useTeam, EquipmentItem } from '@/components/providers/team-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  Package, 
  Plus, 
  Search, 
  Users, 
  CheckCircle2, 
  Clock, 
  ChevronRight,
  Trash2,
  Edit3,
  Archive,
  Wrench,
  Loader2,
  Filter,
  UserPlus,
  RotateCcw,
  LayoutGrid,
  Save
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
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

import { AccessRestricted } from '@/components/layout/AccessRestricted';

const isJerseyAsset = (_name: string, category: string) =>
  category === 'Uniforms';

type SizeStockRow = { id: string; size: string; quantity: string };

const emptyAssetForm = {
  name: '',
  category: 'Uniforms',
  totalQuantity: '0',
  description: '',
};

const newSizeRow = (size = '', quantity = ''): SizeStockRow => ({
  id: crypto.randomUUID(),
  size,
  quantity,
});

const buildSizeStock = (rows: SizeStockRow[]) =>
  rows.reduce<Record<string, number>>((stock, row) => {
    const size = row.size.trim();
    const quantity = Math.max(0, parseInt(row.quantity) || 0);
    if (size && quantity > 0) stock[size] = (stock[size] || 0) + quantity;
    return stock;
  }, {});

const assignedForSize = (item: EquipmentItem, size: string) =>
  Object.values(item.assignments || {})
    .filter(assignment => assignment.size === size)
    .reduce((sum, assignment) => sum + (Number(assignment.quantity) || 0), 0);

const effectiveSizeStock = (item: EquipmentItem): Record<string, number> => {
  if (item.sizeStock && Object.keys(item.sizeStock).length > 0) return item.sizeStock;
  return item.size ? { [item.size]: item.totalQuantity } : {};
};

function SizeStockEditor({
  rows,
  onChange,
  uniform,
}: {
  rows: SizeStockRow[];
  onChange: (rows: SizeStockRow[]) => void;
  uniform: boolean;
}) {
  return (
    <div className="space-y-3 rounded-2xl border-2 border-dashed border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label className="text-[10px] font-black uppercase tracking-widest">
            {uniform ? 'Jersey sizes and stock' : 'Stock sub-items'}
          </Label>
          <p className="mt-1 text-[9px] font-bold uppercase text-muted-foreground">
            {uniform
              ? 'Add the quantity owned for each size'
              : 'Optional: track quantities by size, colour, type, or model'}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl font-black uppercase text-[9px]"
          onClick={() => onChange([...rows, newSizeRow()])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add {uniform ? 'Size' : 'Sub-item'}
        </Button>
      </div>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_90px_40px] items-end gap-2">
            <div className="space-y-1">
              <Label className="text-[9px] font-black uppercase">{uniform ? 'Size' : 'Sub-item'}</Label>
              <Input
                placeholder={uniform ? 'e.g. Youth L' : 'e.g. Orange, Small, Model A'}
                value={row.size}
                onChange={event => onChange(rows.map((current, rowIndex) =>
                  rowIndex === index ? { ...current, size: event.target.value } : current
                ))}
                className="h-11 rounded-xl border-2 font-bold"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[9px] font-black uppercase">Quantity</Label>
              <Input
                type="number"
                min="0"
                value={row.quantity}
                onChange={event => onChange(rows.map((current, rowIndex) =>
                  rowIndex === index ? { ...current, quantity: event.target.value } : current
                ))}
                className="h-11 rounded-xl border-2 font-black"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove size row ${index + 1}`}
              className="h-10 w-10 text-destructive"
              onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
              disabled={rows.length === 1}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EquipmentPage() {
  const { isStaff, isPro } = useTeam();

  if (!isStaff) return <AccessRestricted type="role" />;
  if (!isPro) return <AccessRestricted type="tier" />;

  return <AuthorizedEquipmentPage />;
}

function AuthorizedEquipmentPage() {
  const { activeTeam, isStaff, isPro, members, addEquipmentItem, updateEquipmentItem, deleteEquipmentItem, assignEquipment, returnEquipment, createAlert } = useTeam();

  const db = useFirestore();
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAssignOpen, setIsInviteOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<EquipmentItem | null>(null);

  const [formEq, setFormEq] = useState(emptyAssetForm);
  const [sizeRows, setSizeRows] = useState<SizeStockRow[]>([newSizeRow()]);
  const [assignment, setAssignment] = useState({ userId: '', quantity: '1', size: '', jerseyNumber: '' });

  const eqQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'equipment'), orderBy('name', 'asc'));
  }, [activeTeam?.id, db]);

  const { data: equipmentRaw, isLoading } = useCollection<EquipmentItem>(eqQuery);
  const equipment = useMemo(() => equipmentRaw || [], [equipmentRaw]);

  const filteredEq = useMemo(() => {
    return equipment.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCat = activeCategory === 'all' || item.category === activeCategory;
      return matchesSearch && matchesCat;
    });
  }, [equipment, searchTerm, activeCategory]);

  if (!isStaff) return <AccessRestricted type="role" />;
  if (!isPro) return <AccessRestricted type="tier" />;

  const handleAddItem = async () => {
    if (!formEq.name) return;
    const configuredStock = buildSizeStock(sizeRows);
    const sizeStock = Object.keys(configuredStock).length > 0 ? configuredStock : undefined;
    const totalQuantity = sizeStock
      ? Object.values(sizeStock).reduce((sum, quantity) => sum + quantity, 0)
      : parseInt(formEq.totalQuantity);
    if (isJerseyAsset(formEq.name, formEq.category) && !sizeStock) {
      toast({ title: 'Add Jersey Stock', description: 'Add at least one size and quantity.', variant: 'destructive' });
      return;
    }
    setIsProcessing(true);
    try {
      await addEquipmentItem({
        ...formEq,
        sizeStock,
        totalQuantity,
      });
      setIsAddOpen(false);
      setFormEq(emptyAssetForm);
      setSizeRows([newSizeRow()]);
      toast({ title: "Inventory Updated", description: `${formEq.name} enrolled in vault.` });
    } catch (error: any) {
      toast({ title: 'Inventory Update Failed', description: error?.message || 'Unable to add equipment.', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditItem = async () => {
    if (!selectedItem || !formEq.name) return;
    const configuredStock = buildSizeStock(sizeRows);
    const sizeStock = Object.keys(configuredStock).length > 0 ? configuredStock : undefined;
    const totalQuantity = sizeStock
      ? Object.values(sizeStock).reduce((sum, quantity) => sum + quantity, 0)
      : parseInt(formEq.totalQuantity);
    if (isJerseyAsset(formEq.name, formEq.category) && !sizeStock) {
      toast({ title: 'Add Jersey Stock', description: 'Add at least one size and quantity.', variant: 'destructive' });
      return;
    }
    setIsProcessing(true);
    try {
      await updateEquipmentItem(selectedItem.id, {
        ...formEq,
        sizeStock: sizeStock || null,
        totalQuantity,
      });
      setIsEditOpen(false);
      setSelectedItem(null);
      toast({ title: "Asset Synchronized" });
    } catch (error: any) {
      toast({ title: 'Inventory Update Failed', description: error?.message || 'Unable to update stock.', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const openEdit = (item: EquipmentItem) => {
    setSelectedItem(item);
    setFormEq({
      name: item.name,
      category: item.category,
      totalQuantity: item.totalQuantity.toString(),
      description: item.description || '',
    });
    const existingSizeStock = effectiveSizeStock(item);
    setSizeRows(
      Object.entries(existingSizeStock).length > 0
        ? Object.entries(existingSizeStock).map(([size, quantity]) => newSizeRow(size, String(quantity)))
        : [newSizeRow()]
    );
    setIsEditOpen(true);
  };

  const handleAssign = async () => {
    if (!selectedItem || !assignment.userId || !assignment.quantity) return;
    const qty = parseInt(assignment.quantity);
    if (qty > selectedItem.availableQuantity) {
      toast({ title: "Quota Exceeded", description: "Not enough stock available.", variant: "destructive" });
      return;
    }
    if (
      Object.keys(effectiveSizeStock(selectedItem)).length > 0 &&
      (!assignment.size ||
        qty > ((effectiveSizeStock(selectedItem)[assignment.size] || 0) - assignedForSize(selectedItem, assignment.size)))
    ) {
      toast({ title: 'Size Unavailable', description: 'Select a size with enough jerseys available.', variant: 'destructive' });
      return;
    }
    
    const targetMember = members.find(m => m.userId === assignment.userId);
    if (!targetMember) return;

    setIsProcessing(true);
    try {
      await assignEquipment(
        selectedItem.id,
        targetMember.userId,
        targetMember.name,
        qty,
        Object.keys(effectiveSizeStock(selectedItem)).length > 0 ||
          isJerseyAsset(selectedItem.name, selectedItem.category)
          ? {
              size: assignment.size,
              jerseyNumber: isJerseyAsset(selectedItem.name, selectedItem.category)
                ? assignment.jerseyNumber
                : undefined,
            }
          : undefined
      );

      try {
        await createAlert(
          'Equipment Assigned',
          `${selectedItem.name}${assignment.size ? ` (${assignment.size})` : ''} ×${qty} has been checked out to you. Please confirm receipt with your coach.`,
          'specific',
          targetMember.userId
        );
      } catch (notificationError) {
        console.warn('Equipment was assigned, but the member alert could not be delivered.', notificationError);
      }

      setIsInviteOpen(false);
      setAssignment({ userId: '', quantity: '1', size: '', jerseyNumber: '' });
      toast({ title: "Asset Deployed", description: `${selectedItem.name} assigned to ${targetMember.name}. They’ve been notified.` });
    } catch (error: any) {
      toast({ title: 'Assignment Failed', description: error?.message || 'Unable to assign equipment.', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Accessing Inventory Vault...</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[9px] h-6 px-3">Elite Resources</Badge>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-none">Equipment</h1>
          <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px] ml-1">Asset Management & Inventory Ledger</p>
        </div>

        {isStaff && (
          <Button onClick={() => { setFormEq(emptyAssetForm); setIsAddOpen(true); }} className="h-14 px-8 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 transition-all active:scale-95">
            <Plus className="h-5 w-5 mr-2" /> Add Asset
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <aside className="space-y-6">
          <Card className="rounded-[2rem] border-none shadow-md ring-1 ring-black/5 overflow-hidden bg-white">
            <CardHeader className="bg-muted/30 border-b p-6">
              <div className="flex items-center gap-3">
                <Filter className="h-4 w-4 text-primary" />
                <CardTitle className="text-[10px] font-black uppercase tracking-widest">Inventory Filters</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-1">
              {['all', 'Uniforms', 'Training Gear', 'Facility Kit', 'Medical'].map(cat => (
                <button 
                  key={cat} 
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "w-full flex items-center justify-between p-3 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest",
                    activeCategory === cat ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <span>{cat === 'all' ? 'All Assets' : cat}</span>
                  <ChevronRight className={cn("h-3 w-3", activeCategory === cat ? "opacity-100" : "opacity-40")} />
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="bg-primary/5 p-8 rounded-[2.5rem] border-2 border-dashed border-primary/20 space-y-4">
            <div className="flex items-center gap-3">
              <Archive className="h-5 w-5 text-primary" />
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Strategic Reserves</h4>
            </div>
            <p className="text-[11px] font-medium leading-relaxed italic text-muted-foreground">
              Maintain squad readiness by tracking all tactical equipment. Retirement of assets should be logged for seasonal auditing.
            </p>
          </div>
        </aside>

        <div className="lg:col-span-3 space-y-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search inventory ledger..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-11 h-14 rounded-2xl bg-muted/50 border-none shadow-inner font-black" 
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredEq.map((item) => (
              <Card key={item.id} className="rounded-[2.5rem] border-none shadow-xl overflow-hidden ring-1 ring-black/5 bg-white flex flex-col group">
                <div className={cn("h-2 w-full", item.availableQuantity === 0 ? "bg-red-500" : "bg-primary")} />
                <CardHeader className="p-8 pb-4 space-y-4">
                  <div className="flex justify-between items-start">
                    <Badge variant="outline" className="font-black uppercase text-[8px] tracking-widest border-primary/20 text-primary">{item.category}</Badge>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-primary/5 text-primary" onClick={() => openEdit(item)}>
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Badge className={cn(
                        "font-black text-[8px] px-2 h-5 border-none uppercase",
                        item.status === 'Active' ? "bg-green-500 text-white" : "bg-amber-500 text-white"
                      )}>{item.status}</Badge>
                    </div>
                  </div>
                  <CardTitle className="text-2xl font-black uppercase tracking-tight leading-none group-hover:text-primary transition-colors">{item.name}</CardTitle>
                  <CardDescription className="text-[10px] font-bold uppercase tracking-widest line-clamp-2">{item.description || 'Professional grade squad equipment logged in active inventory.'}</CardDescription>
                  {Object.keys(effectiveSizeStock(item)).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(effectiveSizeStock(item)).map(([size, total]) => {
                        const available = Math.max(0, total - assignedForSize(item, size));
                        return (
                          <Badge key={size} variant="secondary" className="font-black text-[9px]">
                            {size.toUpperCase()}: {available}/{total}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="p-8 pt-0 flex-1 space-y-6">
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                    <div className="bg-muted/30 p-4 rounded-2xl text-center space-y-1">
                      <p className="text-[8px] font-black uppercase opacity-40">Available</p>
                      <p className="text-2xl font-black text-primary">{item.availableQuantity}</p>
                    </div>
                    <div className="bg-muted/30 p-4 rounded-2xl text-center space-y-1">
                      <p className="text-[8px] font-black uppercase opacity-40">Total Stock</p>
                      <p className="text-2xl font-black">{item.totalQuantity}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Assignments</p>
                    <div className="max-h-[120px] overflow-y-auto pr-2 custom-scrollbar space-y-2">
                      {Object.values(item.assignments || {}).map(as => (
                        <div key={as.userId} className="flex items-center justify-between p-3 bg-muted/20 rounded-xl border gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase truncate">{as.userName}</p>
                            {as.date && (
                              <p className="text-[8px] font-medium text-muted-foreground mt-0.5">
                                {format(new Date(as.date), 'MMM d, yyyy ’ h:mm a')}
                              </p>
                            )}
                            {(as.size || as.jerseyNumber) && (
                              <p className="text-[8px] font-black text-primary mt-0.5">
                                {[as.size && `SIZE ${as.size}`, as.jerseyNumber && `#${as.jerseyNumber}`].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] font-black text-primary">QTY: {as.quantity}</span>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10" onClick={() => returnEquipment(item.id, as.userId)}>
                              <RotateCcw className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {Object.keys(item.assignments || {}).length === 0 && (
                        <p className="text-[9px] font-medium text-muted-foreground italic text-center py-4">No active assignments</p>
                      )}
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="p-8 pt-0 flex gap-2">
                  <Button 
                    className="flex-1 h-12 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20"
                    onClick={() => {
                      setSelectedItem(item);
                      setAssignment({
                        userId: '',
                        quantity: '1',
                        size: '',
                        jerseyNumber: '',
                      });
                      setIsInviteOpen(true);
                    }}
                    disabled={item.availableQuantity === 0}
                  >
                    <UserPlus className="h-4 w-4 mr-2" /> Assign to Player
                  </Button>
                  <Button variant="ghost" size="icon" className="h-12 w-12 rounded-xl text-destructive hover:bg-destructive/5" onClick={() => deleteEquipmentItem(item.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
            {filteredEq.length === 0 && (
              <div className="col-span-full py-24 text-center border-2 border-dashed rounded-[3rem] bg-muted/10 opacity-40">
                <Package className="h-12 w-12 mx-auto mb-4" />
                <p className="text-sm font-black uppercase tracking-widest">No matching assets found in vault.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="rounded-[3rem] sm:max-w-xl p-0 border-none shadow-2xl overflow-hidden bg-white">
          <DialogTitle className="sr-only">Enroll Equipment Asset</DialogTitle>
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 lg:p-12 space-y-10">
            <DialogHeader>
              <div className="flex items-center gap-4 mb-2">
                <div className="bg-primary/10 p-3 rounded-2xl text-primary">
                  <Package className="h-6 w-6" />
                </div>
                <div>
                  <DialogTitle className="text-3xl font-black uppercase tracking-tight">Enroll Equipment</DialogTitle>
                  <DialogDescription className="font-bold text-primary uppercase tracking-widest text-[10px]">Add new tactical assets to the vault</DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="space-y-6 py-2">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Asset Name</Label>
                <Input placeholder="e.g. Away Jerseys" value={formEq.name} onChange={e => setFormEq({...formEq, name: e.target.value})} className="h-14 rounded-2xl font-bold border-2 focus:border-primary/20 transition-all" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Category</Label>
                  <Select value={formEq.category} onValueChange={v => setFormEq({...formEq, category: v})}>
                    <SelectTrigger className="h-14 rounded-2xl border-2 font-bold focus:border-primary/20"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      <SelectItem value="Uniforms" className="font-bold">Uniforms</SelectItem>
                      <SelectItem value="Training Gear" className="font-bold">Training Gear</SelectItem>
                      <SelectItem value="Facility Kit" className="font-bold">Facility Kit</SelectItem>
                      <SelectItem value="Medical" className="font-bold">Medical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Total Stock</Label>
                  <Input
                    type="number"
                    min="0"
                    readOnly={
                      isJerseyAsset(formEq.name, formEq.category) ||
                      Object.keys(buildSizeStock(sizeRows)).length > 0
                    }
                    value={Object.keys(buildSizeStock(sizeRows)).length > 0
                      ? Object.values(buildSizeStock(sizeRows)).reduce((sum, quantity) => sum + quantity, 0)
                      : formEq.totalQuantity}
                    onChange={e => setFormEq({...formEq, totalQuantity: e.target.value})}
                    className="h-14 rounded-2xl font-black border-2 focus:border-primary/20 transition-all"
                  />
                </div>
              </div>
              <SizeStockEditor
                rows={sizeRows}
                onChange={setSizeRows}
                uniform={isJerseyAsset(formEq.name, formEq.category)}
              />
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Asset Description</Label>
                <Textarea placeholder="Condition notes or sizing..." value={formEq.description} onChange={e => setFormEq({...formEq, description: e.target.value})} className="rounded-[1.5rem] min-h-[120px] border-2 font-medium focus:border-primary/20 transition-all p-4 resize-none" />
              </div>
            </div>
            <DialogFooter>
              <Button className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl shadow-primary/20 active:scale-[0.98] transition-all" onClick={handleAddItem} disabled={isProcessing || !formEq.name}>
                {isProcessing ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : "Commit Asset to Vault"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="rounded-[3rem] sm:max-w-xl p-0 border-none shadow-2xl overflow-hidden bg-white">
          <DialogTitle className="sr-only">Edit Equipment Asset</DialogTitle>
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 lg:p-12 space-y-10">
            <DialogHeader>
              <div className="flex items-center gap-4 mb-2">
                <div className="bg-primary/10 p-3 rounded-2xl text-primary">
                  <Edit3 className="h-6 w-6" />
                </div>
                <div>
                  <DialogTitle className="text-3xl font-black uppercase tracking-tight">Sync Asset</DialogTitle>
                  <DialogDescription className="font-bold text-primary uppercase tracking-widest text-[10px]">Update inventory parameters</DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="space-y-6 py-2">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Asset Name</Label>
                <Input value={formEq.name} onChange={e => setFormEq({...formEq, name: e.target.value})} className="h-14 rounded-2xl font-bold border-2" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Category</Label>
                  <Select value={formEq.category} onValueChange={v => setFormEq({...formEq, category: v})}>
                    <SelectTrigger className="h-14 rounded-2xl border-2 font-bold"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      <SelectItem value="Uniforms" className="font-bold">Uniforms</SelectItem>
                      <SelectItem value="Training Gear" className="font-bold">Training Gear</SelectItem>
                      <SelectItem value="Facility Kit" className="font-bold">Facility Kit</SelectItem>
                      <SelectItem value="Medical" className="font-bold">Medical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Total Stock</Label>
                  <Input
                    type="number"
                    min="0"
                    readOnly={
                      isJerseyAsset(formEq.name, formEq.category) ||
                      Object.keys(buildSizeStock(sizeRows)).length > 0
                    }
                    value={Object.keys(buildSizeStock(sizeRows)).length > 0
                      ? Object.values(buildSizeStock(sizeRows)).reduce((sum, quantity) => sum + quantity, 0)
                      : formEq.totalQuantity}
                    onChange={e => setFormEq({...formEq, totalQuantity: e.target.value})}
                    className="h-14 rounded-2xl font-black border-2"
                  />
                </div>
              </div>
              <SizeStockEditor
                rows={sizeRows}
                onChange={setSizeRows}
                uniform={isJerseyAsset(formEq.name, formEq.category)}
              />
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Asset Description</Label>
                <Textarea value={formEq.description} onChange={e => setFormEq({...formEq, description: e.target.value})} className="rounded-[1.5rem] min-h-[120px] border-2 font-medium p-4 resize-none" />
              </div>
            </div>
            <DialogFooter>
              <Button className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl" onClick={handleEditItem} disabled={isProcessing || !formEq.name}>
                {isProcessing ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : <Save className="h-5 w-5 mr-2" />}
                Commit Synchronization
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isAssignOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-md border-none shadow-2xl p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight">Deploy Asset</DialogTitle>
            <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Assigning: {selectedItem?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Target Squad Member</Label>
              <Select value={assignment.userId} onValueChange={v => setAssignment({...assignment, userId: v})}>
                <SelectTrigger className="h-14 rounded-xl border-2 font-bold"><SelectValue placeholder="Select player..." /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  {members.map(m => (
                    <SelectItem key={m.userId} value={m.userId} className="font-bold">{m.name} ({m.position})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Quantity</Label>
              <Input type="number" value={assignment.quantity} onChange={e => setAssignment({...assignment, quantity: e.target.value})} className="h-12 rounded-xl font-black border-2" />
            </div>
            {selectedItem && Object.keys(effectiveSizeStock(selectedItem)).length > 0 && (
              <div className={cn(
                'grid gap-4',
                isJerseyAsset(selectedItem.name, selectedItem.category) ? 'grid-cols-2' : 'grid-cols-1'
              )}>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">
                    {isJerseyAsset(selectedItem.name, selectedItem.category) ? 'Size' : 'Sub-item'}
                  </Label>
                  <Select value={assignment.size} onValueChange={size => setAssignment({...assignment, size})}>
                    <SelectTrigger className="h-12 rounded-xl border-2 font-bold">
                      <SelectValue placeholder="Choose size..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {Object.entries(effectiveSizeStock(selectedItem)).map(([size, total]) => {
                        const available = Math.max(0, total - assignedForSize(selectedItem, size));
                        return (
                          <SelectItem key={size} value={size} disabled={available === 0} className="font-bold">
                            {size} ({available} available)
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                {isJerseyAsset(selectedItem.name, selectedItem.category) && (
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Number</Label>
                    <Input inputMode="numeric" placeholder={selectedItem.jerseyNumber || 'e.g. 12'} value={assignment.jerseyNumber} onChange={e => setAssignment({...assignment, jerseyNumber: e.target.value})} className="h-12 rounded-xl font-bold border-2" />
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              className="w-full h-14 rounded-2xl text-lg font-black shadow-xl"
              onClick={handleAssign}
              disabled={
                isProcessing ||
                !assignment.userId ||
                (selectedItem !== null &&
                  Object.keys(effectiveSizeStock(selectedItem)).length > 0 &&
                  !assignment.size)
              }
            >
              Dispatch Asset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="rounded-[3rem] border-none shadow-2xl bg-black text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none">
          <Wrench className="h-48 w-48" />
        </div>
        <CardContent className="p-12 relative z-10 space-y-6">
          <Badge className="bg-primary text-white border-none font-black text-[10px] px-4 h-7">Institutional Logistics</Badge>
          <h2 className="text-4xl font-black tracking-tight leading-tight uppercase">Master Stock Control</h2>
          <p className="text-white/60 font-medium text-lg leading-relaxed max-w-2xl">
            Coordinated inventory management ensures your elite squad is always fully equipped for match day. Assignment history provides a clear audit trail for fiscal accountability and seasonal equipment recovery.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
