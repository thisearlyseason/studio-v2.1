"use client";
import { useState, useEffect } from 'react';
import { useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
export default function SignupAlerts() {
 const {user,isUserLoading}=useUser();
 const [alerts,setAlerts]=useState<Array<{id:string;title:string;message:string;createdAt:string;emailStatus:string}>>([]);
 const [status,setStatus]=useState(''); const [busy,setBusy]=useState(false);
 async function request(test=false, retry=false) {
  setBusy(true);
  try {
   const token=await user?.getIdToken();
   const response=await fetch(`/api/admin/signup-alerts${test?'?test=true':retry?'?retry=true':''}`,{method:test||retry?'POST':'GET',headers:{Authorization:`Bearer ${token}`}});
   const data=await response.json();if(!response.ok)throw new Error(data.error);
   if(test||retry){setStatus(test?'Test signup emails accepted. Check the superadmin inbox.':'Pending email delivery retried.');await request();}else setAlerts(data.alerts);
  }catch(e){setStatus(e instanceof Error?e.message:'Unable to load signup notifications.');}finally{setBusy(false);}
 }
 useEffect(()=>{if(user)void request();else if(!isUserLoading)setStatus('Sign in as a superadmin to view signup notifications.');},[user,isUserLoading]);
 return <main className="mx-auto max-w-4xl p-6 space-y-6"><a href="/admin" className="font-bold">← Superadmin</a><h1 className="text-3xl font-black uppercase">Signup notifications</h1><p>New accounts and confirmed paid subscriptions appear here and are emailed to verified superadmins.</p><div className="flex gap-3"><Button disabled={busy} onClick={()=>request()}>Refresh</Button><Button variant="outline" disabled={busy} onClick={()=>request(true)}>Send test signup alerts</Button><Button variant="outline" disabled={busy} onClick={()=>request(false,true)}>Retry failed emails</Button></div><p role="status">{status}</p>{alerts.map(a=><article key={a.id} className="rounded-2xl border bg-card p-6 space-y-2"><h2 className="font-bold text-xl">{a.title}</h2><p>{a.message}</p><p className="text-sm text-muted-foreground">{a.createdAt} · Email: {a.emailStatus}</p></article>)}</main>;
}
