"use client";

import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter,
  DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Download, Copy, Check, Mail, Globe, Users } from 'lucide-react';
import { Member } from '@/components/providers/team-provider';
import { toast } from '@/hooks/use-toast';

interface EmailExportDialogProps {
  members: Member[];
  teamName: string;
  getLeagueMembers?: (leagueId: string) => Promise<Member[]>;
  leagueIds?: Record<string, boolean>;
}

export function EmailExportDialog({ members, teamName, getLeagueMembers, leagueIds }: EmailExportDialogProps) {
  const [includePlayers, setIncludePlayers] = useState(true);
  const [includeParents, setIncludeParents] = useState(true);
  const [scope, setScope] = useState<'team' | 'league'>('team');
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [leagueMembers, setLeagueMembers] = useState<Member[]>([]);

  const isPartOfLeague = leagueIds && Object.keys(leagueIds).length > 0;

  useEffect(() => {
    if (scope === 'league' && isPartOfLeague && getLeagueMembers) {
      const leagueId = Object.keys(leagueIds)[0];
      setIsLoading(true);
      getLeagueMembers(leagueId).then((members) => {
        setLeagueMembers(members);
        setIsLoading(false);
      }).catch(() => {
        setIsLoading(false);
      });
    }
  }, [scope, isPartOfLeague, getLeagueMembers, leagueIds]);

  const getContacts = () => {
    const contacts: { name: string; email: string; type: string }[] = [];
    const isLeagueScope = scope === 'league';
    const relevantMembers = isLeagueScope ? leagueMembers : members;

    relevantMembers.forEach(member => {
      const position = (member.position || '').toLowerCase();
      const isCoach = 
        position.includes('coach') || 
        position.includes('trainer') || 
        position.includes('staff') ||
        position.includes('manager') ||
        position.includes('director') ||
        member.role === 'Admin';
        
      const isAdmin = member.role === 'Admin';
      
      if (isCoach || isAdmin) {
        if (member.email) contacts.push({ name: member.name, email: member.email.toLowerCase().trim(), type: 'Staff/Coach' });
        if (member.parentEmail) contacts.push({ name: `${member.name} (Alt)`, email: member.parentEmail.toLowerCase().trim(), type: 'Staff/Coach' });
      } else {
        if (includePlayers && member.email) {
          contacts.push({ name: member.name, email: member.email.toLowerCase().trim(), type: 'Athlete' });
        }
        
        if (includeParents && member.parentEmail) {
          contacts.push({ name: `${member.name} Guardian`, email: member.parentEmail.toLowerCase().trim(), type: 'Parent' });
        }
      }
    });

    // Remove duplicates by email and sort
    const uniqueContacts = Array.from(new Map(contacts.map(c => [c.email, c])).values())
      .filter(c => !!c.email)
      .sort((a, b) => a.name.localeCompare(b.name));

    return uniqueContacts;
  };

  const contactList = getContacts();
  const emailList = contactList.map(c => c.email);

  const handleCopy = () => {
    const emails = emailList.join(', ');
    if (emails) {
      navigator.clipboard.writeText(emails);
      setCopied(true);
      toast({
        title: "Success: Emails Copied",
        description: `Exported ${emailList.length} unique addresses. Ready for BCC in Gmail/Outlook.`,
      });
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast({
        title: "No Contacts Exported",
        description: "Zero valid email addresses found. Check if roster profiles have email values populated.",
        variant: "destructive"
      });
    }
  };

  const handleDownload = () => {
    const emails = emailList.join('\n');
    if (!emails) {
      toast({
        title: "Export Failed",
        description: "Cannot generate file: No email addresses discovered with current filters.",
        variant: "destructive"
      });
      return;
    }

    const scopeLabel = scope === 'league' ? 'League' : 'Team';
    const blob = new Blob([emails], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scopeLabel}_Manifest_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Manifest Downloaded",
      description: `Contact list exported as ${scopeLabel}_Manifest_${Date.now()}.txt`,
    });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="rounded-full px-5 font-black uppercase text-[10px] h-10 lg:h-11 tracking-widest border-2 border-primary/20 hover:border-primary hover:bg-primary/5 transition-all group"
        >
          <Mail className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform" />
          Export Emails
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden bg-white text-foreground">
        <div className="h-2 bg-primary w-full" />
        <div className="p-8 space-y-8">
          <DialogHeader>
            <DialogTitle className="text-3xl font-black uppercase tracking-tight text-foreground">Personnel Export</DialogTitle>
            <div className="flex items-center gap-2 mt-1">
              <DialogDescription className="font-bold text-primary uppercase text-[10px] shrink-0 tracking-widest">
                Extract contact data for {teamName}
              </DialogDescription>
              <div className="h-px bg-primary/20 flex-1 ml-2" />
            </div>
          </DialogHeader>
          
          <div className="space-y-6">
            {isPartOfLeague && (
              <div className="bg-black/5 p-6 rounded-3xl border-2 border-dashed space-y-4">
                <Label className="text-[10px] font-black uppercase tracking-widest text-foreground">Scope</Label>
                <RadioGroup value={scope} onValueChange={(v) => setScope(v as 'team' | 'league')} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="team" id="team" className="h-5 w-5 border-2" />
                    <Label htmlFor="team" className="text-[10px] font-black uppercase tracking-widest cursor-pointer flex items-center gap-1">
                      <Users className="h-3 w-3" /> Team Only
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="league" id="league" className="h-5 w-5 border-2" />
                    <Label htmlFor="league" className="text-[10px] font-black uppercase tracking-widest cursor-pointer flex items-center gap-1">
                      <Globe className="h-3 w-3" /> League-wide
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            <div className="bg-black/5 p-6 rounded-3xl border-2 border-dashed space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="players" className="text-[10px] font-black uppercase tracking-widest cursor-pointer text-foreground">Include Athletes</Label>
                <Checkbox 
                  id="players" 
                  checked={includePlayers} 
                  onCheckedChange={(checked) => setIncludePlayers(checked === true)} 
                  className="rounded-lg border-2 h-6 w-6 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
              </div>
              <div className="flex items-center justify-between border-b border-black/5 pb-4">
                <Label htmlFor="parents" className="text-[10px] font-black uppercase tracking-widest cursor-pointer text-foreground">Include Guardians</Label>
                <Checkbox 
                  id="parents" 
                  checked={includeParents} 
                  onCheckedChange={(checked) => setIncludeParents(checked === true)} 
                  className="rounded-lg border-2 h-6 w-6 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-black uppercase tracking-widest text-foreground">Validated Contacts ({contactList.length})</Label>
                <Badge className="bg-primary text-white border-none font-black text-[8px] h-5 px-3 uppercase tracking-widest">Staff Included</Badge>
              </div>
              
              <div className="max-h-[200px] overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-primary/20">
                {contactList.length > 0 ? contactList.map((contact, idx) => (
                  <div key={idx} className="flex flex-col bg-white/50 p-3 rounded-xl border border-black/5 shadow-sm">
                    <div className="flex items-center justify-between gap-2 text-foreground">
                      <span className="text-[11px] font-black uppercase tracking-tight truncate max-w-[150px]">{contact.name}</span>
                      <Badge className="bg-black/5 text-black/60 border-none font-bold text-[8px] h-4 px-2 uppercase tracking-wide shrink-0">
                        {contact.type}
                      </Badge>
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground truncate">{contact.email}</span>
                  </div>
                )) : (
                  <div className="text-center py-8 text-black/30">
                    <Mail className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    <p className="text-[10px] font-bold uppercase tracking-widest">No contacts discovered</p>
                  </div>
                )}
              </div>
            </div>

            {/* U18 Parental Features Notice */}
            <div className="p-6 bg-amber-50 rounded-3xl border-2 border-dashed border-amber-200/50 space-y-2">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-amber-600" />
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-800">U18 Safety Protocol</span>
              </div>
              <p className="text-[10px] font-bold text-amber-800/80 leading-relaxed">
                For Under 18 teams, parental features MUST be explicitly initiated for all athletes. Ensure every player under 18 has a guardian account linked to their roster profile.
              </p>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-4 pt-2">
            <Button variant="outline" onClick={handleCopy} disabled={isLoading} className="rounded-2xl h-14 font-black uppercase text-[10px] tracking-widest border-2 flex-1 shadow-sm hover:shadow-md transition-all">
              {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              {copied ? "Copied" : "Copy (Gmail)"}
            </Button>
            <Button onClick={handleDownload} disabled={isLoading} className="rounded-2xl h-14 font-black uppercase text-[10px] tracking-widest flex-1 shadow-xl shadow-primary/20 active:scale-95 transition-all">
              <Download className="h-4 w-4 mr-2" />
              Download .txt
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}