'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/firebase';
import { useTeam } from '@/components/providers/team-provider';
import { getAuthToken, authHeader } from '@/lib/client-auth';
import { nativeBilling, type StorePackage } from '@/lib/native-billing/client';
import { Button } from '@/components/ui/button';
import { NATIVE_PRODUCTS } from '@/lib/native-billing/catalog';

export function NativeSubscriptions() {
  const auth=useAuth(), {activeTeam,user}=useTeam();
  const [packages,setPackages]=useState<StorePackage[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[existing,setExisting]=useState(false);
  const [cycle,setCycle]=useState('P1M');
  async function run(action:'catalog'|'purchase'|'restore'|'manage',packageId?:string) {
    setBusy(true);setMessage('');
    const uid=auth.currentUser?.uid;
    try {
      if(!uid || auth.currentUser?.isAnonymous || activeTeam?.isDemo) throw new Error('Sign in to your own account to manage subscriptions. Demo purchases are unavailable.');
      const token = await getAuthToken(auth);
      if (!token) throw new Error('Sign in again to manage subscriptions.');
      const result=await nativeBilling(action,token,packageId);
      if(auth.currentUser?.uid!==uid) return;
      if(result.cancelled){setMessage('Purchase cancelled.');return;}
      if(result.packages) {
        setPackages(result.packages);setExisting(Boolean(result.existingSubscription));
        if (!result.packages.length) setMessage('No plans are available from your store yet. Please try again later.');
      }
      if(action==='purchase'||action==='restore') {
        const ownedTeam=activeTeam?.ownerUserId===uid ? activeTeam.id : undefined;
        const response=await fetch('/api/native-billing/sync',{method:'POST',headers:{'Content-Type':'application/json',...authHeader(await getAuthToken(auth))},body:JSON.stringify({teamId:ownedTeam})});
        const data=await response.json();if(!response.ok)throw new Error(data.error);
        setExisting(data.active);setMessage(data.active?'Your subscription is active. Your team access has been updated.':'No active store subscription was found for this account.');
      }
    } catch(error) {setMessage(error instanceof Error?error.message:'Unable to contact the store.');}
    finally {setBusy(false);}
  }
  useEffect(()=>{setPackages([]);setExisting(false);},[user?.id]);
  return <section className="mx-auto max-w-2xl space-y-5 p-5">
    <h1 className="text-3xl font-bold">The Squad subscriptions</h1>
    <p>Choose a plan for your squads. Your subscription works with the same The Squad account across devices.</p>
    <div className="flex flex-wrap gap-3">
      <Button disabled={busy} onClick={()=>run('catalog')}>{busy?'Contacting store…':'View available plans'}</Button>
      <Button variant="outline" disabled={busy} onClick={()=>run('restore')}>Restore purchases</Button>
      <Button variant="outline" disabled={busy} onClick={()=>run('manage')}>Manage store subscription</Button>
    </div>
    {message && <p role="status" className="rounded-xl border p-4">{message}</p>}
    {existing && <p>You already have a subscription. Use its original billing provider to manage or cancel it.</p>}
    {packages.length>0 && <>
      <div className="flex gap-3"><Button variant={cycle==='P1M'?'default':'outline'} onClick={()=>setCycle('P1M')}>Monthly</Button><Button variant={cycle==='P1Y'?'default':'outline'} onClick={()=>setCycle('P1Y')}>Yearly</Button></div>
      {cycle==='P1Y' && <p className="text-sm text-muted-foreground">Yearly billing is available for Pro Team. Elite Teams, Elite League and Schools offer monthly billing in the app.</p>}
      {packages.filter(p=>p.period===cycle).map(p=><article key={p.id} className="space-y-3 rounded-2xl border p-5">
        <h2 className="text-xl font-bold">{p.title}</h2><p>{p.price} / {p.period==='P1Y'?'year':'month'}</p>
        <p className="text-sm text-muted-foreground">{NATIVE_PRODUCTS[p.productId.split(':')[0]]?.capacity} paid squad seats</p>
        <Button disabled={busy||existing} onClick={()=>run('purchase',p.id)}>Subscribe</Button>
      </article>)}
      <p className="text-sm text-muted-foreground">Payment is charged to your Apple or Google account after you confirm. Subscriptions renew automatically unless cancelled before the renewal date. Manage or cancel in your app store subscription settings. Prices and availability are supplied by your store.</p>
    </>}
    <p className="text-sm text-muted-foreground">Restoring a purchase requires the same The Squad account and Apple or Google account used for the original purchase.</p>
    <p className="flex gap-4 text-sm"><Link href="/terms">Terms of use</Link><Link href="/privacy">Privacy policy</Link></p>
  </section>;
}
