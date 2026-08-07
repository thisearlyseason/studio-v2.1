'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, Heading2, Image as ImageIcon, Link2, Loader2, Minus, Plus, Save, Type } from 'lucide-react';
import { useTeam } from '@/components/providers/team-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { toast } from '@/hooks/use-toast';
import { NewsletterBlock, renderNewsletterHtml } from '@/lib/newsletter-content';

const fallbackBlocks: NewsletterBlock[] = [
  { id: 'welcome-intro', type: 'paragraph', text: 'Thanks for subscribing. You will now receive product news, sports insights, and updates from **The Squad**.' },
  { id: 'welcome-hub', type: 'button', label: 'Explore the Sports Hub', url: 'https://www.thesquad.pro/sports-hub' },
];

function createBlock(type: NewsletterBlock['type']): NewsletterBlock {
  const id = crypto.randomUUID();
  if (type === 'heading') return { id, type, text: 'Section heading' };
  if (type === 'paragraph') return { id, type, text: 'Write your welcome message here.' };
  if (type === 'image') return { id, type, url: '', alt: '', caption: '' };
  if (type === 'button') return { id, type, label: 'Learn More', url: 'https://www.thesquad.pro' };
  return { id, type };
}

export function WelcomeEmailManager() {
  const { firebaseUser } = useTeam();
  const [enabled, setEnabled] = useState(false);
  const [subject, setSubject] = useState('Welcome to The Squad');
  const [previewText, setPreviewText] = useState('You are officially on The Squad newsletter list.');
  const [title, setTitle] = useState('Welcome to The Squad');
  const [blocks, setBlocks] = useState<NewsletterBlock[]>(fallbackBlocks);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const authenticatedFetch = useCallback(async (url: string, init?: RequestInit) => {
    if (!firebaseUser) throw new Error('Your admin session is unavailable.');
    const request = async (forceRefresh: boolean) => fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await firebaseUser.getIdToken(forceRefresh)}`,
        ...init?.headers,
      },
    });
    const response = await request(false);
    return response.status === 401 ? request(true) : response;
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) return;
    let active = true;
    void authenticatedFetch('/api/admin/newsletter/welcome')
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Unable to load the welcome email.');
        if (!active) return;
        const welcome = payload.welcome;
        setEnabled(welcome.enabled === true);
        setSubject(welcome.subject || 'Welcome to The Squad');
        setPreviewText(welcome.previewText || '');
        setTitle(welcome.title || 'Welcome to The Squad');
        setBlocks(Array.isArray(welcome.blocks) && welcome.blocks.length ? welcome.blocks : fallbackBlocks);
      })
      .catch(error => toast({ title: 'Welcome Email Load Failed', description: error instanceof Error ? error.message : 'Please retry.', variant: 'destructive' }))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authenticatedFetch, firebaseUser]);

  const previewHtml = useMemo(() => renderNewsletterHtml({ subject, previewText, title, blocks }), [subject, previewText, title, blocks]);
  const updateBlock = (id: string, update: Partial<NewsletterBlock>) => {
    setBlocks(current => current.map(block => block.id === id ? { ...block, ...update } as NewsletterBlock : block));
  };
  const moveBlock = (index: number, direction: -1 | 1) => {
    setBlocks(current => {
      const destination = index + direction;
      if (destination < 0 || destination >= current.length) return current;
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await authenticatedFetch('/api/admin/newsletter/welcome', {
        method: 'PUT',
        body: JSON.stringify({ enabled, subject, previewText, title, blocks }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to save the welcome email.');
      toast({
        title: 'Welcome Email Saved',
        description: enabled ? 'New subscribers will receive this email once.' : 'The automatic welcome email is currently disabled.',
      });
    } catch (error) {
      toast({ title: 'Welcome Email Save Failed', description: error instanceof Error ? error.message : 'Please retry.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-20 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
      <div className="space-y-6">
        <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 space-y-5">
          <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/60 p-4">
            <div><p className="font-black uppercase text-sm">Automatic delivery</p><p className="text-xs text-muted-foreground">Send once when a new email subscribes.</p></div>
            <Button type="button" variant={enabled ? 'default' : 'outline'} onClick={() => setEnabled(value => !value)} aria-pressed={enabled} className="rounded-full font-black uppercase text-[10px]">
              {enabled ? 'Enabled' : 'Disabled'}
            </Button>
          </div>
          <div><Label>Subject line</Label><Input value={subject} onChange={event => setSubject(event.target.value)} maxLength={200} className="mt-2 h-12 rounded-xl" /></div>
          <div><Label>Inbox preview text</Label><Input value={previewText} onChange={event => setPreviewText(event.target.value)} maxLength={300} className="mt-2 h-12 rounded-xl" /></div>
          <div><Label>Email headline</Label><Input value={title} onChange={event => setTitle(event.target.value)} maxLength={200} className="mt-2 h-12 rounded-xl" /></div>
        </div>

        <div className="space-y-4">
          {blocks.map((block, index) => (
            <div key={block.id} className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">{block.type}</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => moveBlock(index, -1)} disabled={index === 0}><ArrowUp className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => moveBlock(index, 1)} disabled={index === blocks.length - 1}><ArrowDown className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setBlocks(current => current.filter(item => item.id !== block.id))} className="text-destructive"><Minus className="h-4 w-4" /></Button>
                </div>
              </div>
              {(block.type === 'heading' || block.type === 'paragraph') && (
                <RichTextEditor value={block.text} onChange={text => updateBlock(block.id, { text })} ariaLabel={`welcome ${block.type} visual editor`} minHeightClassName={block.type === 'heading' ? 'min-h-24' : 'min-h-56'} />
              )}
              {block.type === 'image' && <div className="space-y-3"><Input type="url" value={block.url} onChange={event => updateBlock(block.id, { url: event.target.value })} placeholder="https://… public image URL" /><Input value={block.alt} onChange={event => updateBlock(block.id, { alt: event.target.value })} placeholder="Image description" maxLength={300} /><Input value={block.caption || ''} onChange={event => updateBlock(block.id, { caption: event.target.value })} placeholder="Optional caption" maxLength={500} /></div>}
              {block.type === 'button' && <div className="grid sm:grid-cols-2 gap-3"><Input value={block.label} onChange={event => updateBlock(block.id, { label: event.target.value })} placeholder="Button label" maxLength={120} /><Input type="url" value={block.url} onChange={event => updateBlock(block.id, { url: event.target.value })} placeholder="https://…" /></div>}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            ['heading', Heading2, 'Heading'], ['paragraph', Type, 'Text'], ['image', ImageIcon, 'Image'], ['button', Link2, 'Button'], ['divider', Minus, 'Divider'],
          ].map(([type, Icon, label]) => (
            <Button key={String(type)} variant="outline" onClick={() => setBlocks(current => [...current, createBlock(type as NewsletterBlock['type'])])} className="rounded-xl text-[10px] font-black uppercase">
              <Icon className="mr-2 h-4 w-4" /><Plus className="mr-1 h-3 w-3" />{String(label)}
            </Button>
          ))}
        </div>
        <Button onClick={() => void save()} disabled={saving || !subject.trim() || !title.trim() || blocks.length === 0} className="h-14 w-full rounded-2xl font-black uppercase tracking-widest">
          {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />} Save New Subscriber Email
        </Button>
      </div>
      <div className="xl:sticky xl:top-6 space-y-5">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-400"><Eye className="h-4 w-4" /> Live email preview</div>
        <iframe title="New subscriber email preview" sandbox="" srcDoc={previewHtml} className="h-[760px] w-full rounded-2xl border bg-gray-100" />
      </div>
    </div>
  );
}
