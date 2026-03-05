"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  ChevronLeft, 
  Send, 
  BarChart2, 
  MoreVertical, 
  Sparkles,
  X,
  Plus,
  Trash2,
  Users,
  ImagePlus,
  XCircle,
  Loader2,
  ImageIcon,
  ShieldAlert,
  Hash,
  Clock,
  CheckCircle2,
  Paperclip,
  MessageSquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { suggestPollQuestionAndOptions } from '@/ai/flows/poll-question-and-option-suggestion';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useTeam, Message } from '@/components/providers/team-provider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useFirestore, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { collection, query, orderBy, limit, doc } from 'firebase/firestore';

export default function ChatRoomPage() {
  const { chatId } = useParams();
  const router = useRouter();
  const { addMessage, votePoll, user, formatTime, activeTeam } = useTeam();
  const db = useFirestore();
  
  const [input, setInput] = useState('');
  const [isPollDialogOpen, setIsPollDialogOpen] = useState(false);
  const [pollPrompt, setPollPrompt] = useState('');
  const [pollOptions, setPollOptions] = useState<{text: string, image?: string}[]>([{text: '', image: undefined}, {text: '', image: undefined}]);
  const [suggestedPoll, setSuggestedPoll] = useState<{question: string, options: string[]} | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatImage, setChatImage] = useState<string | undefined>();
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const chatDocRef = useMemoFirebase(() => {
    if (!activeTeam || !db || !chatId) return null;
    return doc(db, 'teams', activeTeam.id, 'groupChats', chatId as string);
  }, [activeTeam?.id, db, chatId]);

  const { data: currentChat, isLoading: isChatLoading } = useDoc(chatDocRef);

  const messagesQuery = useMemoFirebase(() => {
    if (!activeTeam || !db || !chatId) return null;
    return query(
      collection(db, 'teams', activeTeam.id, 'groupChats', chatId as string, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(100)
    );
  }, [activeTeam?.id, db, chatId]);

  const { data: rawMessages, isLoading: isMessagesLoading } = useCollection<Message>(messagesQuery);
  const messages = useMemo(() => rawMessages || [], [rawMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages.length]);

  const handleSendMessage = () => {
    if ((!input.trim() && !chatImage) || !chatId || !user) return;
    addMessage(chatId as string, user.name, input, chatImage ? 'image' : 'text', chatImage);
    setInput('');
    setChatImage(undefined);
  };

  const handleSuggestPoll = async () => {
    if (!pollPrompt.trim()) return;
    setIsGenerating(true);
    try {
      const result = await suggestPollQuestionAndOptions({ prompt: pollPrompt });
      setSuggestedPoll(result);
    } catch (error) {
      toast({ title: "Error", description: "Failed to generate poll.", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreatePoll = () => {
    if (!chatId || !user) return;
    let question = pollPrompt;
    let finalOptions = pollOptions.filter(o => o.text.trim() !== '');
    if (suggestedPoll) {
      question = suggestedPoll.question;
      finalOptions = suggestedPoll.options.map(o => ({text: o, image: undefined}));
    }
    if (!question || finalOptions.length < 2) return;
    const pollData = { id: 'p' + Date.now(), question, options: finalOptions.map(o => ({ text: o.text, imageUrl: o.image, votes: 0 })), totalVotes: 0, voters: {}, isClosed: false };
    addMessage(chatId as string, user.name, '', 'poll', undefined, pollData);
    setIsPollDialogOpen(false); setSuggestedPoll(null); setPollPrompt(''); setPollOptions([{text: '', image: undefined}, {text: '', image: undefined}]);
  };

  if (isChatLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 animate-pulse">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-xs font-black text-muted-foreground uppercase tracking-[0.2em]">Synchronizing Secure Feed...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] md:h-[calc(100vh-130px)] -mt-4 md:-mt-4 -mx-4 overflow-hidden bg-muted/5">
      <div className="flex items-center gap-3 p-4 border-b bg-white sticky top-0 z-20 shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => router.push('/chats')} className="rounded-xl h-10 w-10 shrink-0">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
          <Hash className="h-5 w-5 stroke-[3px]" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-black truncate text-lg tracking-tight uppercase leading-none">{currentChat?.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Active Coordination</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10 text-muted-foreground hover:text-primary">
            <Users className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10 text-muted-foreground hover:text-primary">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 py-6" ref={scrollRef}>
        <div className="max-w-4xl mx-auto space-y-8 pb-10">
          {isMessagesLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary opacity-20" /></div>
          ) : messages.length > 0 ? (
            messages.map((msg, idx) => {
              const isMe = msg.authorId === user?.id;
              const isPoll = msg.type === 'poll';
              const showAuthor = idx === 0 || messages[idx-1].authorId !== msg.authorId;
              
              return (
                <div key={msg.id} className={cn("flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300", isMe ? 'items-end' : 'items-start', showAuthor && "pt-4")}>
                  {showAuthor && (
                    <div className="flex items-center gap-2 mb-2 px-1">
                      {!isMe && <Avatar className="h-6 w-6 rounded-lg border shadow-sm"><AvatarFallback className="text-[8px] font-black">{msg.author[0]}</AvatarFallback></Avatar>}
                      <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">{msg.author}</span>
                      {msg.isOpponentCoach && (
                        <Badge className="bg-amber-500 text-black border-none text-[7px] font-black uppercase h-4 px-2">Opponent Staff</Badge>
                      )}
                      <span className="text-[8px] text-muted-foreground/40 font-bold">{formatTime(msg.createdAt)}</span>
                    </div>
                  )}
                  
                  {!isPoll ? (
                    <div className={cn(
                      "max-w-[85%] sm:max-w-[70%] p-4 rounded-3xl text-sm shadow-md space-y-3 relative group transition-all", 
                      isMe 
                        ? "bg-primary text-white rounded-tr-none" 
                        : "bg-white text-foreground rounded-tl-none border ring-1 ring-black/5"
                    )}>
                      {msg.imageUrl && (
                        <div className="relative overflow-hidden rounded-2xl border-2 border-white/10 group-hover:scale-[1.02] transition-transform">
                          <img src={msg.imageUrl} className="w-full object-cover max-h-[400px]" alt="Shared Media" />
                        </div>
                      )}
                      {msg.content && <p className="font-bold leading-relaxed">{msg.content}</p>}
                    </div>
                  ) : (
                    <div className="w-full max-w-[95%] sm:max-w-[80%] bg-white border rounded-[2.5rem] overflow-hidden shadow-xl ring-1 ring-black/5">
                      <div className="bg-primary/5 p-6 border-b flex items-center justify-between">
                        <div className="space-y-1">
                          <Badge className="bg-primary text-white border-none text-[8px] font-black uppercase h-5 px-3">Squad Consensus</Badge>
                          <h4 className="font-black text-xl tracking-tight">{msg.poll?.question}</h4>
                        </div>
                        <BarChart2 className="h-8 w-8 text-primary opacity-20" />
                      </div>
                      <div className="p-6 space-y-4">
                        {msg.poll?.options.map((opt: any, i: number) => {
                          const percentage = msg.poll!.totalVotes > 0 ? (opt.votes / msg.poll!.totalVotes) * 100 : 0;
                          return (
                            <button 
                              key={i} 
                              onClick={() => votePoll(chatId as string, msg.id, i)} 
                              className="w-full text-left space-y-2 group/opt active:scale-[0.98] transition-all"
                            >
                              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest px-1">
                                <span className="group-hover/opt:text-primary transition-colors">{opt.text}</span>
                                <span className="text-primary bg-primary/10 px-2 py-0.5 rounded-full">{opt.votes} votes</span>
                              </div>
                              <div className="relative h-3 bg-muted rounded-full overflow-hidden shadow-inner border border-black/5">
                                <div 
                                  className="absolute top-0 left-0 h-full bg-primary transition-all duration-1000 ease-out" 
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <div className="bg-muted/30 p-4 text-center border-t">
                        <p className="text-[9px] font-black uppercase text-muted-foreground tracking-[0.2em]">{msg.poll?.totalVotes || 0} TOTAL SQUAD RESPONSES</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-32 text-center space-y-6 opacity-20">
              <div className="bg-primary/10 p-10 rounded-[3rem] ring-4 ring-primary/5">
                <MessageSquare className="h-16 w-16 text-primary" />
              </div>
              <p className="text-sm font-black uppercase tracking-[0.3em]">Channel established. Awaiting tactical orders.</p>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 md:p-6 bg-white border-t mt-auto relative z-30 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
        <div className="max-w-4xl mx-auto space-y-4">
          {chatImage && (
            <div className="relative inline-block animate-in zoom-in duration-300">
              <img src={chatImage} className="h-24 w-auto rounded-[1.5rem] border-4 border-white shadow-xl ring-1 ring-black/10" alt="Preview" />
              <Button variant="destructive" size="icon" className="absolute -top-3 -right-3 h-8 w-8 rounded-full shadow-lg border-2 border-white" onClick={() => setChatImage(undefined)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          <div className="flex items-end gap-3">
            <div className="flex gap-2 pb-1">
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={e => { if (e.target.files?.[0]) { const r = new FileReader(); r.onload = ev => setChatImage(ev.target?.result as string); r.readAsDataURL(e.target.files[0]); } }} />
              <Button variant="outline" size="icon" className="rounded-2xl shrink-0 h-12 w-12 border-muted hover:bg-primary/5 hover:border-primary/20 text-muted-foreground hover:text-primary transition-all shadow-sm" onClick={() => fileInputRef.current?.click()}>
                <ImageIcon className="h-5 w-5" />
              </Button>
              <Button variant="outline" size="icon" className="rounded-2xl shrink-0 h-12 w-12 border-muted hover:bg-primary/5 hover:border-primary/20 text-muted-foreground hover:text-primary transition-all shadow-sm" onClick={() => setIsPollDialogOpen(true)}>
                <BarChart2 className="h-5 w-5" />
              </Button>
            </div>
            
            <div className="flex-1 relative">
              <Input 
                className="w-full rounded-[1.5rem] bg-muted/30 border-2 border-transparent focus:border-primary/20 focus:bg-white h-12 px-6 font-bold text-base transition-all pr-12 shadow-inner" 
                placeholder="Tactical update..." 
                value={input} 
                onChange={e => setInput(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && handleSendMessage()} 
              />
              <Button 
                size="icon" 
                className="absolute right-1.5 top-1.5 rounded-2xl h-9 w-9 shadow-lg shadow-primary/30 hover:scale-105 active:scale-95 transition-all" 
                onClick={handleSendMessage}
                disabled={!input.trim() && !chatImage}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={isPollDialogOpen} onOpenChange={setIsPollDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-[3rem] border-none shadow-2xl overflow-hidden p-0">
          <div className="h-2 bg-primary w-full" />
          <div className="p-8">
            <DialogHeader className="mb-6">
              <DialogTitle className="text-3xl font-black uppercase tracking-tight leading-none">Launch Poll</DialogTitle>
              <DialogDescription className="text-[10px] uppercase font-bold tracking-[0.2em] text-primary/60 mt-2">Build squad consensus</DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-2">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Tactical Question</Label>
                <div className="flex gap-2">
                  <Input value={pollPrompt} onChange={e => setPollPrompt(e.target.value)} className="h-14 rounded-2xl font-black border-2 text-base" placeholder="e.g. Jersey design choice?" />
                  <Button variant="secondary" size="icon" className="h-14 w-14 shrink-0 rounded-2xl shadow-inner border-2" onClick={handleSuggestPoll} disabled={isGenerating}>
                    {isGenerating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5 text-primary" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Polling Options</Label>
                <div className="space-y-2">
                  {pollOptions.map((o, i) => (
                    <Input key={i} placeholder={`Option ${i+1}`} value={o.text} onChange={e => { const n = [...pollOptions]; n[i].text = e.target.value; setPollOptions(n); }} className="h-11 rounded-xl bg-muted/20 border-none font-bold" />
                  ))}
                </div>
                <Button variant="ghost" size="sm" className="text-[10px] font-black uppercase tracking-widest text-primary h-8" onClick={() => setPollOptions([...pollOptions, {text: '', image: undefined}])}>+ Add Option</Button>
              </div>
            </div>
            <DialogFooter className="mt-8">
              <Button className="w-full h-16 rounded-2xl font-black text-lg uppercase shadow-xl shadow-primary/20 active:scale-95 transition-all" onClick={handleCreatePoll}>Deploy Squad Poll</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}