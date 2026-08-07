'use client';

import { AlertCircle, ExternalLink, Lock, RefreshCw, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type PortalStatusProps = {
  status?: number | null;
  message?: string | null;
  title?: string;
  onRetry?: () => void;
};

export function PortalStatus({ status, message, title, onRetry }: PortalStatusProps) {
  const isForbidden = status === 403;
  const isUnavailable = status !== 404 && !isForbidden;
  const heading = title || (isForbidden ? 'Portal Access Restricted' : status === 404 ? 'Portal Not Found' : 'Portal Temporarily Unavailable');
  const description = message || (isForbidden
    ? 'This subscription does not include this public portal. Ask the organizer to upgrade or enable the feature.'
    : status === 404
      ? 'This link may be inactive, private, archived, or no longer available.'
      : 'The portal service could not be reached. Please retry in a moment.');

  return (
    <div className="min-h-screen bg-muted/10 flex items-center justify-center p-6">
      <Card className="max-w-md w-full text-center p-8 sm:p-10 rounded-[2rem] border-none shadow-xl bg-white">
        <div className="mx-auto mb-5 h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          {isForbidden ? <Lock className="h-7 w-7" /> : isUnavailable ? <ShieldAlert className="h-7 w-7" /> : <AlertCircle className="h-7 w-7" />}
        </div>
        <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight">{heading}</h2>
        <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{description}</p>
        <div className="flex flex-col sm:flex-row justify-center gap-2 mt-6">
          {onRetry && isUnavailable && (
            <Button variant="outline" onClick={onRetry} className="rounded-xl font-black uppercase text-[10px] tracking-widest">
              <RefreshCw className="h-3.5 w-3.5 mr-2" /> Retry
            </Button>
          )}
          <Button asChild className="rounded-xl font-black uppercase text-[10px] tracking-widest">
            <Link href="/">
              <ExternalLink className="h-3.5 w-3.5 mr-2" /> Return Home
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
