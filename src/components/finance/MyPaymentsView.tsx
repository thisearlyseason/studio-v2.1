"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Download, Receipt, CreditCard, Banknote, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { generateBrandedPDF } from '@/lib/pdf-utils';
import { toast } from '@/hooks/use-toast';

interface Payment {
  id: string;
  teamId: string;
  paymentItemName: string;
  payer_name: string;
  payer_email: string;
  amount: number; // cents
  currency: string;
  payment_method: 'online' | 'offline';
  status: 'paid' | 'pending' | 'failed';
  stripe_receipt_url?: string;
  notes?: string;
  createdAt: string;
}

interface MyPaymentsViewProps {
  /** The authenticated user's email address */
  userEmail: string;
  /** All team IDs the user belongs to (to query across teams) */
  teamIds: string[];
}

/**
 * MyPaymentsView
 *
 * Read-only payment history for players (adult_player role) and parents/guardians.
 * Shows online payments with a "View Receipt" button linking to the Stripe-hosted
 * receipt, and offline payments with a "Download Record" PDF option.
 *
 * Access: shown to isParent || (isPlayer && member.isAdult)
 * The parent component is responsible for the access guard.
 */
export function MyPaymentsView({ userEmail, teamIds }: MyPaymentsViewProps) {
  const db = useFirestore();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const teamKey = teamIds.slice(0, 5).join('\u0000');

  useEffect(() => {
    const selectedTeamIds = teamKey ? teamKey.split('\u0000') : [];
    if (!db || !userEmail || selectedTeamIds.length === 0) {
      setPayments([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const results = new Map<string, Payment[]>();
    const initialized = new Set<string>();
    const publish = (teamId: string, values: Payment[]) => {
      results.set(teamId, values);
      initialized.add(teamId);
      setPayments(
        Array.from(results.values())
          .flat()
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      );
      if (initialized.size === selectedTeamIds.length) setIsLoading(false);
    };

    const unsubscribes = selectedTeamIds.map(teamId => onSnapshot(
      query(
        collection(db, 'teams', teamId, 'payments'),
        where('payer_email', '==', userEmail.toLowerCase()),
        orderBy('createdAt', 'desc')
      ),
      snapshot => publish(teamId, snapshot.docs.map(docSnapshot => ({
        id: docSnapshot.id,
        teamId,
        ...docSnapshot.data(),
      } as Payment))),
      error => {
        console.error(`[MyPaymentsView] Unable to load payments for team ${teamId}:`, error);
        publish(teamId, []);
      }
    ));

    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [db, teamKey, userEmail]);

  const totalPaid = useMemo(() =>
    (payments || [])
      .filter(p => p.status === 'paid')
      .reduce((sum, p) => sum + (p.amount || 0), 0),
    [payments]
  );

  const handleDownloadOfflineRecord = (payment: Payment) => {
    try {
      generateBrandedPDF(
        {
          title: 'Payment Record',
          subtitle: `OFFLINE PAYMENT CONFIRMATION`,
          filename: `payment_record_${payment.id}`,
          lightMode: true,
        },
        (doc, startY) => {
          let y = startY;
          const pageW = doc.internal.pageSize.getWidth();

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(0, 0, 0);
          doc.text('PAYMENT DETAILS', 20, y);
          y += 10;

          const lines = [
            ['Item',        payment.paymentItemName || 'Payment'],
            ['Date',        payment.createdAt ? format(new Date(payment.createdAt), 'PPP') : '—'],
            ['Amount',      `$${((payment.amount || 0) / 100).toFixed(2)} ${(payment.currency || 'usd').toUpperCase()}`],
            ['Method',      'Offline (Cash / Check / Other)'],
            ['Status',      payment.status.toUpperCase()],
            ['Payer',       payment.payer_name || payment.payer_email || '—'],
            ...(payment.notes ? [['Notes', payment.notes]] : []),
          ] as [string, string][];

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(80, 80, 80);

          lines.forEach(([key, val]) => {
            if (y > 265) { doc.addPage(); y = 20; }
            doc.setFont('helvetica', 'bold');
            doc.text(key + ':', 20, y);
            doc.setFont('helvetica', 'normal');
            doc.text(val, 80, y);
            y += 8;
          });

          doc.setDrawColor(220, 220, 220);
          doc.line(20, y + 4, pageW - 20, y + 4);
          y += 14;

          doc.setFont('helvetica', 'italic');
          doc.setFontSize(8);
          doc.setTextColor(150, 150, 150);
          doc.text('This is an internal payment record. For questions, contact your team organizer.', 20, y);

          return y + 10;
        }
      );
      toast({ title: 'Record Downloaded', description: 'Payment record PDF saved.' });
    } catch (err) {
      toast({ title: 'Download Failed', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary/30" />
      </div>
    );
  }

  if (!payments?.length) {
    return (
      <div className="py-16 text-center opacity-30 space-y-3 border-2 border-dashed rounded-[2.5rem]">
        <Receipt className="h-12 w-12 mx-auto" />
        <p className="text-xs font-black uppercase tracking-widest">No payment records found.</p>
        <p className="text-[9px] font-bold uppercase tracking-[0.2em]">
          Your payments will appear here once recorded by your team organizer.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary KPI */}
      <Card className="rounded-[2rem] border-none shadow-md bg-black text-white p-6 relative overflow-hidden">
        <Receipt className="absolute -right-4 -bottom-4 h-20 w-20 opacity-10" />
        <p className="text-[9px] font-black uppercase tracking-widest opacity-50">Total Paid</p>
        <p className="text-4xl font-black mt-1">
          ${(totalPaid / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </p>
        <p className="text-[9px] font-bold opacity-30 uppercase tracking-widest mt-1">
          {payments.filter(p => p.status === 'paid').length} payment{payments.filter(p => p.status === 'paid').length !== 1 ? 's' : ''} recorded
        </p>
      </Card>

      {/* Payment list */}
      <div className="space-y-3">
        {payments.map(payment => {
          const isOnline = payment.payment_method === 'online';
          const isPaid = payment.status === 'paid';
          const amountStr = `$${((payment.amount || 0) / 100).toFixed(2)}`;

          return (
            <Card
              key={payment.id}
              className="rounded-[2rem] border-none shadow-md bg-white ring-1 ring-black/5 overflow-hidden"
            >
              <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  {/* Icon */}
                  <div className={cn(
                    'p-2.5 rounded-xl shrink-0',
                    isOnline ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'
                  )}>
                    {isOnline ? <CreditCard className="h-4 w-4" /> : <Banknote className="h-4 w-4" />}
                  </div>

                  {/* Info */}
                  <div className="min-w-0">
                    <p className="text-sm font-black uppercase tracking-tight truncate">
                      {payment.paymentItemName || 'Payment'}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge className={cn(
                        'border-none font-black text-[7px] uppercase px-2 h-4',
                        isOnline ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                      )}>
                        {isOnline ? 'Online' : 'Offline'}
                      </Badge>
                      <Badge className={cn(
                        'border-none font-black text-[7px] uppercase px-2 h-4',
                        isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      )}>
                        {payment.status}
                      </Badge>
                      {payment.createdAt && (
                        <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">
                          {(() => { try { return format(new Date(payment.createdAt), 'MMM d, yyyy'); } catch { return ''; } })()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xl font-black text-primary">{amountStr}</span>

                  {isOnline && payment.stripe_receipt_url ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(payment.stripe_receipt_url!, '_blank')}
                      className="h-9 rounded-xl font-black text-[9px] uppercase tracking-widest border-2 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-all"
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> View Receipt
                    </Button>
                  ) : !isOnline ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownloadOfflineRecord(payment)}
                      className="h-9 rounded-xl font-black text-[9px] uppercase tracking-widest border-2 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700 transition-all"
                    >
                      <Download className="h-3.5 w-3.5 mr-1.5" /> Download
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
