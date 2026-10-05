"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogTitle} from '@/components/ui/dialog';
import {qrImage,snapshotHtml,downloadFile} from '@/lib/competition/export';
import type {CompetitionDocument} from '@/lib/competition/document';
export default function TournamentQuickExports({document,teamId,eventId}:{document:CompetitionDocument;teamId:string;eventId:string}) {
  const [open,setOpen]=useState(false);
  const url=typeof window==='undefined'?'':`${window.location.origin}/tournaments/live/${encodeURIComponent(teamId)}/${encodeURIComponent(eventId)}`;
  const print=(html:string)=>{const popup=window.open('','_blank');if(popup){popup.onload=()=>popup.print();popup.document.write(html);popup.document.close();}};
  const style='h-8 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/10 font-black uppercase text-[9px] tracking-widest';
  return <>
    <Button className={style} onClick={()=>setOpen(true)}>QR code</Button>
    <Button className={style} onClick={()=>print(snapshotHtml(document))}>Print / Save as PDF</Button>
    <Button className={style} onClick={()=>downloadFile('tournament-snapshot.html',snapshotHtml(document))}>Download snapshot</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><div className="p-6 sm:p-8 space-y-6"><DialogTitle className="pr-10">Tournament QR code</DialogTitle><img src={qrImage(url)} alt="Live tournament QR code" className="mx-auto max-w-full"/><div className="flex flex-wrap gap-3"><Button onClick={()=>print(`<html><title>Tournament QR</title><body><img alt="Live tournament QR" src="${qrImage(url)}"/></body></html>`)}>Print QR</Button><Button onClick={()=>{const img=new Image();img.onload=()=>{const canvas=window.document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;canvas.getContext('2d')?.drawImage(img,0,0);const a=window.document.createElement('a');a.href=canvas.toDataURL('image/png');a.download='tournament-qr.png';a.click();};img.src=qrImage(url);}}>Download QR PNG</Button></div></div></DialogContent></Dialog>
  </>;
}
