
"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { useTeam } from '@/components/providers/team-provider';
import { ChevronLeft } from 'lucide-react';

export default function NewTeamPage() {
  const router = useRouter();
  const { createNewTeam } = useTeam();
  const [teamName, setTeamName] = useState('');
  const [organizerPosition, setOrganizerPosition] = useState('Coach');

  const handleCreate = () => {
    if (teamName.trim()) {
      createNewTeam(teamName, organizerPosition);
      router.push('/feed');
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6 pt-4">
      <Button variant="ghost" onClick={() => router.back()} className="-ml-2">
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back
      </Button>

      <Card className="border-none shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-black">Create Your Team</CardTitle>
          <CardDescription>Establish a new hub for coordination and communication.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="teamName">Team Name</Label>
            <Input 
              id="teamName" 
              placeholder="e.g. Westside Warriors" 
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              className="h-12 text-lg"
            />
          </div>

          <div className="space-y-2">
            <Label>Your Role as Organizer</Label>
            <Select value={organizerPosition} onValueChange={setOrganizerPosition}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Select your role..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Coach">Coach</SelectItem>
                <SelectItem value="Team Lead">Team Lead</SelectItem>
                <SelectItem value="Assistant Coach">Assistant Coach</SelectItem>
                <SelectItem value="Squad Leader">Squad Leader</SelectItem>
                <SelectItem value="">Leave Blank (Manager)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">
              You can always update your role or invite others as coaches later.
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <Button 
            className="w-full h-12 text-lg font-bold" 
            disabled={!teamName.trim()}
            onClick={handleCreate}
          >
            Create Team
          </Button>
        </CardFooter>
      </Card>
      
      <div className="bg-muted/50 p-4 rounded-xl text-center">
        <p className="text-xs text-muted-foreground">
          By creating a team, you become the primary administrator and can manage all members, events, and chats.
        </p>
      </div>
    </div>
  );
}
