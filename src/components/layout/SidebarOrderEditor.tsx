'use client';
import { useState } from 'react';
import { ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import { useAuth } from '@/firebase';
import { getAuthToken, authHeader } from '@/lib/client-auth';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Tool = { href: string; name: string };
export function SidebarOrderEditor({teamId, tools, management, onClose}: {
  teamId: string; tools: Tool[]; management: Tool[]; onClose: () => void;
}) {
  const auth = useAuth();
  const [groups, setGroups] = useState([tools, management]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState('');
  function move(group: number, from: string, to?: string) {
    if (!to || from === to) return;
    setGroups(previous => {
      const rows = [...previous[group]];
      const source = rows.findIndex(t => t.href === from);
      const target = rows.findIndex(t => t.href === to);
      if (source < 0 || target < 0) return previous;
      rows.splice(target, 0, rows.splice(source, 1)[0]);
      return previous.map((items, i) => i === group ? rows : items);
    });
  }
  async function save(reset: boolean) {
    setBusy(true); setError('');
    try {
      const token = await getAuthToken(auth);
      if (!token) throw Error('Sign in again to save your order.');
      const response = await fetch('/api/teams/sidebar-order', {method:'POST',headers:{...authHeader(token),'Content-Type':'application/json'},
        body:JSON.stringify({teamId, order:reset ? [] : groups.flat().map(item => item.href)})});
      if (!response.ok) throw Error('Your order could not be saved. Try again.');
      onClose();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save your order.'); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[90dvh] rounded-3xl p-5 sm:max-w-md">
      <DialogHeader className="pr-9"><DialogTitle>Reorder tools</DialogTitle><DialogDescription>Drag a handle or use the arrows. This order is yours for this team.</DialogDescription></DialogHeader>
      <div className="min-h-0 overflow-y-auto py-3">{groups.map((items, group) => items.length > 0 && <section key={group}>
        <h3 className="my-2 text-sm font-bold">{group ? 'Management' : 'Team tools'}</h3>
        <ol>{items.map((tool, index) => <li key={tool.href} data-tool-order={tool.href} className={'mb-1 flex items-center gap-2 rounded-xl border px-2 py-1 ' + (dragging === tool.href ? 'border-primary bg-muted' : '')}>
          <span aria-hidden="true" className="grid size-10 touch-none cursor-grab select-none place-items-center" onPointerDown={event => {
            if (busy || event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId); setDragging(tool.href);
          }} onPointerCancel={() => setDragging('')} onPointerUp={event => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            const target = document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-tool-order]');
            move(group,tool.href,target?.dataset.toolOrder); setDragging('');
          }}><GripVertical size={18}/></span>
          <span className="flex-1 text-sm font-semibold">{tool.name}</span>
          <Button size="icon" variant="ghost" disabled={busy || index === 0} aria-label={'Move '+tool.name+' up'} onClick={() => move(group,tool.href,items[index-1]?.href)}><ArrowUp/></Button>
          <Button size="icon" variant="ghost" disabled={busy || index === items.length-1} aria-label={'Move '+tool.name+' down'} onClick={() => move(group,tool.href,items[index+1]?.href)}><ArrowDown/></Button>
        </li>)}</ol></section>)}</div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-between gap-2 pt-2"><Button variant="outline" disabled={busy} onClick={() => save(true)}>Restore default</Button><Button disabled={busy} onClick={() => save(false)}>Save order</Button></div>
    </DialogContent>
  </Dialog>;
}
