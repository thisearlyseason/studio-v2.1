import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AppUnavailablePage() {
  return (
    <main className="min-h-screen bg-black px-4 py-10 grid place-items-center">
      <Card className="w-full max-w-lg rounded-[2.5rem] border-none shadow-2xl">
        <CardHeader className="items-center text-center pt-10">
          <BrandLogo variant="light-background" className="h-12 w-40 mb-5" priority />
          <CardTitle className="text-3xl font-black uppercase tracking-tight">
            This action isn&apos;t available in the app
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 px-8 pb-10 text-center">
          <p className="text-sm text-muted-foreground">
            You can continue to your account or team. If you need help, contact The Squad support.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button asChild className="h-12 rounded-2xl font-black uppercase">
              <Link href="/dashboard">Go to account</Link>
            </Button>
            <Button asChild variant="outline" className="h-12 rounded-2xl font-black uppercase">
              <Link href="/teams/join">Join a team</Link>
            </Button>
          </div>
          <a className="text-sm font-bold text-primary underline underline-offset-4" href="mailto:team@thesquad.pro">
            team@thesquad.pro
          </a>
          <div className="flex justify-center gap-4 text-xs font-bold">
            <Link href="/privacy" className="hover:text-primary">Privacy</Link>
            <Link href="/settings" className="hover:text-primary">Account settings</Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
