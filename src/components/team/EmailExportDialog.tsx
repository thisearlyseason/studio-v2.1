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
  const [includeParents, setIncludeParents] = useState(false);
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

  const getEmails = () => {
    const emailSet = new Set<string>();
    const relevantMembers = scope === 'league' && leagueMembers.length > 0 ? leagueMembers : members;

    relevantMembers.forEach(member => {
      const isCoach = member.position?.toLowerCase().includes('coach');
      const isAdmin = member.role === 'Admin';
      
      if (isCoach || isAdmin) {
        if (member.parentEmail) emailSet.add(member.parentEmail.toLowerCase().trim());
        if (member.email) emailSet.add(member.email.toLowerCase().trim());
      } else {
        if (includePlayers && member.parentEmail) {
          emailSet.add(member.parentEmail.toLowerCase().trim());
        }
        if (includePlayers && member.email && !member.parentEmail) {
             emailSet.add(member.email.toLowerCase().trim());
        }
      }
    });

    return Array.from(emailSet).filter(Boolean);
  };

  const emailList = getEmails();
  const scopeLabel = scope === 'league' ? 'League-wide' : 'Team';

  const handleCopy = () => {
    const emails = emailList.join(', ');
    if (emails) {
      navigator.clipboard.writeText(emails);
      setCopied(true);
      toast({
        title: "Emails Copied",
        description: `${emailList.length} email addresses copied to clipboard (Gmail compatible).`,
      });
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast({
        title: "No Emails Found",
        description: "There are no email addresses to copy based on your selection.",
        variant: "destructive"
      });
    }
  };

  const handleDownload = () => {
    const emails = emailList.join('\n');
    if (!emails) {
      toast({
        title: "No Emails Found",
        description: "There are no email addresses to download.",
        variant: "destructive"
      });
      return;
    }

    const blob = new Blob([emails], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scopeLabel}_${teamName.replace(/\s+/g, '_')}_emails.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Emails Downloaded",
      description: `File saved as ${scopeLabel}_${teamName.replace(/\s+/g, '_')}_emails.txt`,
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
              <div className="flex items-center justify-between">
                <Label htmlFor="parents" className="text-[10px] font-black uppercase tracking-widest cursor-pointer text-foreground">Include Guardians</Label>
                <Checkbox 
                  id="parents" 
                  checked={includeParents} 
                  onCheckedChange={(checked) => setIncludeParents(checked === true)} 
                  className="rounded-lg border-2 h-6 w-6 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
              </div>
              
              <div className="pt-4 border-t border-black/5 flex items-center justify-between">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Staff & Hub Admins</span>
                <Badge className="bg-primary text-white border-none font-black text-[8px] h-5 px-3 uppercase tracking-widest">Always Included</Badge>
              </div>
            </div>

            <div className="p-8 bg-primary/5 rounded-[2.5rem] text-center space-y-2 border-2 border-dashed border-primary/20">
              <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">
                {isLoading ? 'Loading...' : 'Validated Contacts'}
              </p>
              <p className="text-5xl font-black text-primary tracking-tight">{isLoading ? '...' : emailList.length}</p>
              <p className="text-[9px] font-medium text-muted-foreground italic leading-relaxed px-4">
                {scope === 'league' 
                  ? 'All teams in the league included.'
                  : 'Current team roster only.'}
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