"use client";

import Link from 'next/link';
import { ArrowRight, PlusCircle, ShieldCheck, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function NoActiveTeamState({
  title = 'Connect a Squad First',
  description = 'This workspace uses squad data. Create a free squad or join an existing one to continue.',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Card className="mx-auto max-w-2xl overflow-hidden rounded-[2.5rem] border-none bg-white shadow-xl ring-1 ring-black/5">
      <div className="h-2 bg-primary" />
      <CardContent className="space-y-7 p-8 text-center sm:p-12">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[2rem] bg-primary/10 text-primary">
          <ShieldCheck className="h-10 w-10" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">{title}</h2>
          <p className="mx-auto max-w-lg text-sm font-medium leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button asChild className="h-14 rounded-2xl font-black uppercase tracking-wider">
            <Link href="/teams/new">
              <PlusCircle className="mr-2 h-5 w-5" /> Create Free Squad
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-14 rounded-2xl border-2 font-black uppercase tracking-wider">
            <Link href="/teams/join">
              <UserPlus className="mr-2 h-5 w-5" /> Join With Code
            </Link>
          </Button>
        </div>
        <Link href="/competition" className="inline-flex items-center text-xs font-black uppercase tracking-widest text-primary hover:underline">
          Return to Competition Hub <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </CardContent>
    </Card>
  );
}
