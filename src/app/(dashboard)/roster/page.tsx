
"use client";

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, MoreVertical, ShieldCheck, Mail, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MOCK_ROSTER = [
  { id: '1', name: 'James Miller', role: 'Admin', position: 'Head Coach', jersey: 'COACH', avatar: 'https://picsum.photos/seed/coach/150/150' },
  { id: '2', name: 'Alex Smith', role: 'Member', position: 'Striker', jersey: '10', avatar: 'https://picsum.photos/seed/alex/150/150' },
  { id: '3', name: 'Sarah Connor', role: 'Member', position: 'Midfield', jersey: '08', avatar: 'https://picsum.photos/seed/sarah/150/150' },
  { id: '4', name: 'Mike Ross', role: 'Member', position: 'Defense', jersey: '04', avatar: 'https://picsum.photos/seed/mike/150/150' },
  { id: '5', name: 'Donna Paulsen', role: 'Member', position: 'Goalkeeper', jersey: '01', avatar: 'https://picsum.photos/seed/donna/150/150' },
];

export default function RosterPage() {
  const [searchTerm, setSearchTerm] = useState('');
  
  const filteredRoster = MOCK_ROSTER.filter(member => 
    member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.position.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Team Roster</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by name or position..." 
            className="pl-9 bg-muted/50 border-none rounded-xl"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-3">
        {filteredRoster.map((member) => (
          <Card key={member.id} className="overflow-hidden border-none shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="relative">
                <Avatar className="h-14 w-14 rounded-2xl border-2 border-background shadow-sm">
                  <AvatarImage src={member.avatar} />
                  <AvatarFallback className="rounded-2xl">{member.name[0]}</AvatarFallback>
                </Avatar>
                {member.role === 'Admin' && (
                  <div className="absolute -top-1 -right-1 bg-primary text-white p-1 rounded-full shadow-lg border-2 border-background">
                    <ShieldCheck className="h-3 w-3" />
                  </div>
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="font-bold truncate">{member.name}</h3>
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 border-primary/20 text-primary font-bold">
                    #{member.jersey}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground font-medium">{member.position}</p>
                <div className="flex gap-3 mt-2">
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full bg-muted/50 hover:bg-primary/10 hover:text-primary">
                    <Mail className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full bg-muted/50 hover:bg-primary/10 hover:text-primary">
                    <Phone className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>View Profile</DropdownMenuItem>
                  <DropdownMenuItem>Edit Member Info</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive">Remove from Team</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardContent>
          </Card>
        ))}
      </div>
      
      {filteredRoster.length === 0 && (
        <div className="text-center py-20">
          <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="h-8 w-8 text-muted-foreground opacity-20" />
          </div>
          <h3 className="font-bold text-lg">No members found</h3>
          <p className="text-sm text-muted-foreground">Try adjusting your search criteria.</p>
        </div>
      )}
    </div>
  );
}
