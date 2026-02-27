
"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  User, 
  Bell, 
  Lock, 
  LogOut, 
  Camera, 
  ChevronRight,
  Shield,
  HelpCircle,
  Mail
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';

export default function SettingsPage() {
  const [notifications, setNotifications] = useState(true);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Profile Section */}
      <Card className="border-none shadow-sm overflow-hidden">
        <div className="bg-primary/5 h-20 w-full" />
        <CardContent className="-mt-10 space-y-4">
          <div className="flex flex-col items-center space-y-3">
            <div className="relative">
              <Avatar className="h-24 w-24 border-4 border-background shadow-lg">
                <AvatarImage src="https://picsum.photos/seed/me/150/150" />
                <AvatarFallback>SF</AvatarFallback>
              </Avatar>
              <Button size="icon" variant="secondary" className="absolute bottom-0 right-0 h-8 w-8 rounded-full shadow-md">
                <Camera className="h-4 w-4" />
              </Button>
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold">James Miller</h2>
              <p className="text-sm text-muted-foreground">j.miller@squadforge.com</p>
            </div>
            <Button variant="outline" size="sm" className="rounded-full px-6">Edit Profile</Button>
          </div>
        </CardContent>
      </Card>

      {/* Menu Options */}
      <div className="space-y-4">
        <Card className="border-none shadow-sm">
          <CardContent className="p-0">
            <div className="divide-y">
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-lg text-primary">
                    <Bell className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">Push Notifications</p>
                    <p className="text-[10px] text-muted-foreground">Alerts for posts, events & chats</p>
                  </div>
                </div>
                <Switch checked={notifications} onCheckedChange={setNotifications} />
              </div>
              
              <button className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="bg-amber-100 p-2 rounded-lg text-amber-600">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold">Privacy & Security</p>
                    <p className="text-[10px] text-muted-foreground">Manage your account protection</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>

              <button className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="bg-green-100 p-2 rounded-lg text-green-600">
                    <HelpCircle className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold">Help & Support</p>
                    <p className="text-[10px] text-muted-foreground">Get assistance or report an issue</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardContent className="p-0">
            <button className="w-full p-4 flex items-center justify-between hover:bg-destructive/5 text-destructive transition-colors">
              <div className="flex items-center gap-3">
                <div className="bg-destructive/10 p-2 rounded-lg">
                  <LogOut className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold">Log Out</p>
                  <p className="text-[10px] opacity-70">Sign out of your session</p>
                </div>
              </div>
            </button>
          </CardContent>
        </Card>
      </div>

      <div className="text-center pt-4">
        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">SquadForge v1.0.0 (MVP)</p>
      </div>
    </div>
  );
}
