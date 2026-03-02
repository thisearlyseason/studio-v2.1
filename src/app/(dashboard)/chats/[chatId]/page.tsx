
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
  ShieldAlert
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
  const { addMessage, votePoll, user, formatTime, members, activeTeam } = useTeam();
  const db = useFirestore();
  
  const [input, setInput] = useState('');
  const [isPollDialogOpen, setIsPollDialogOpen] = useState(false);
  const [pollPrompt, setPollPrompt] = useState('');
  const [pollOptions, setPollOptions] = useState<{text: string, image?: string}[]>([{text: '', image: undefined}, {text: '', image: undefined}]);
  const [suggestedPoll, setSuggestedPoll] = useState<{question: string, options: string[]} | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatImage, setChatImage] = useState<string | undefined>();
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  
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

  const { data: messages = [], isLoading: isMessagesLoading } = useCollection<Message>(messagesQuery);

  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages?.length]);

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

  if (isChatLoading) return <div className="flex flex-col items-center justify-center h-full gap-4"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Opening discussion...</p></div>;

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] md:h-[calc(100vh-130px)] -mt-4 md:-mt-4 -mx-4 overflow-hidden">
      <div className="flex items-center gap-2 md:gap-3 p-3 md:p-4 border-b bg-background sticky top-0 z-10 shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => router.push('/chats')} className="rounded-full h-9 w-9 md:h-10 md:w-10"><ChevronLeft className="h-5 w-5" /></Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-black truncate text-base md:text-lg tracking-tight">{currentChat?.name}</h2>
          <p className="text-[8px] md:text-[10px] font-black text-muted-foreground uppercase tracking-widest">Squad Coordination</p>
        </div>
        <Button variant="ghost" size="icon" className="rounded-full h-9 w-9 md:h-10 md:w-10"><MoreVertical className="h-5 w-5" /></Button>
      </div>

      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 space-y-6 pb-10">
          {isMessagesLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary opacity-20" /></div>
          ) : (
            <>
              {messages.length > 0 ? (
                messages.map((msg) => {
                  const isMe = msg.authorId === user?.id;
                  const isPoll = msg.type === 'poll';
                  
                  return (
                    <div key={msg.id} className={cn("flex flex-col gap-1.5", isMe ? 'items-end' : 'items-start')}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[8px] lg:text-[9px] font-black uppercase text-muted-foreground tracking-widest">{msg.author}</span>
                        {msg.isOpponentCoach && (
                          <Badge className="bg-amber-500 text-black border-none text-[7px] font-black uppercase h-3.5 px-1.5 flex items-center gap-1">
                            <ShieldAlert className="h-2 w-2" /> Opponent Coach • {msg.opponentTeamName}
                          </Badge>
                        )}
                        <span className="text-[8px] lg:text-[9px] text-muted-foreground/50 font-bold">{formatTime(msg.createdAt)}</span>
                      </div>
                      
                      {!isPoll ? (
                        <div className={cn("max-w-[85%] sm:max-w-[70%] p-3 lg:p-3.5 rounded-2xl text-xs lg:text-sm shadow-sm space-y-2 break-words", 
                          isMe ? "bg-primary text-white rounded-tr-none" : 
                          msg.isOpponentCoach ? "bg-amber-100 text-amber-900 border-2 border-amber-200 rounded-tl-none ring-4 ring-amber-500/10" : 
                          "bg-muted text-foreground rounded-tl-none")}>
                          {msg.imageUrl && <img src={msg.imageUrl} className="rounded-xl object-cover max-h-[300px] mb-2 border-2 border-white/20" alt="Media" />}
                          {msg.content && <p className="font-medium leading-relaxed">{msg.content}</p>}
                        </div>
                      ) : (
                        <div className="w-full max-w-[95%] sm:max-w-[80%] bg-card border rounded-2xl lg:rounded-[2rem] overflow-hidden shadow-md">
                          <div className="bg-primary/5 p-4 lg:p-5 border-b">
                            <h4 className="font-black text-sm lg:text-lg tracking-tight">{msg.poll?.question}</h4>
                          </div>
                          <div className="p-4 space-y-3">
                            {msg.poll?.options.map((opt: any, i: number) => {
                              const percentage = msg.poll!.totalVotes > 0 ? (opt.votes / msg.poll!.totalVotes) * 100 : 0;
                              return (
                                <button key={i} onClick={() => votePoll(chatId as string, msg.id, i)} className="w-full text-left space-y-1 group">
                                  <div className="flex justify-between text-[10px] font-black uppercase">
                                    <span>{opt.text}</span>
                                    <span className="text-primary">{opt.votes}</span>
                                  </div>
                                  <Progress value={percentage} className="h-2 rounded-full" />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 opacity-30">
                  <div className="bg-muted p-6 rounded-full"><Users className="h-8 w-8" /></div>
                  <p className="text-xs font-black uppercase tracking-widest">Secure Coordination Channel</p>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      <div className="p-3 md:p-4 bg-background border-t mt-auto relative z-20">
        {chatImage && (
          <div className="mb-2 relative inline-block">
            <img src={chatImage} className="h-16 w-auto rounded-xl border-2 border-primary/10" alt="Preview" />
            <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6 rounded-full" onClick={() => setChatImage(undefined)}><X className="h-3.5 w-3.5" /></Button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={e => { if (e.target.files?.[0]) { const r = new FileReader(); r.onload = ev => setChatImage(ev.target?.result as string); r.readAsDataURL(e.target.files[0]); } }} />
          <Button variant="outline" size="icon" className="rounded-full shrink-0 h-10 w-10 border-primary/20 text-primary" onClick={() => fileInputRef.current?.click()}><ImagePlus className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" className="rounded-full shrink-0 h-10 w-10 border-primary/20 text-primary" onClick={() => setIsPollDialogOpen(true)}><BarChart2 className="h-4 w-4" /></Button>
          <Input className="flex-1 rounded-full bg-muted border-none h-10 px-4 font-medium" placeholder="Message..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} />
          <Button size="icon" className="rounded-full shrink-0 h-10 w-10 shadow-lg" onClick={handleSendMessage}><Send className="h-4 w-4" /></Button>
        </div>
      </div>

      <Dialog open={isPollDialogOpen} onOpenChange={setIsPollDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Squad Poll</DialogTitle>
            <DialogDescription className="text-xs uppercase font-bold tracking-widest text-primary/60">Collect consensus</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Question</Label>
              <div className="flex gap-2">
                <Input value={pollPrompt} onChange={e => setPollPrompt(e.target.value)} className="h-11 rounded-xl font-bold" />
                <Button variant="secondary" size="icon" className="h-11 w-11 shrink-0 rounded-xl" onClick={handleSuggestPoll} disabled={isGenerating}><Sparkles className="h-4 w-4 text-primary" /></Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Options</Label>
              {pollOptions.map((o, i) => (
                <Input key={i} placeholder={`Option ${i+1}`} value={o.text} onChange={e => { const n = [...pollOptions]; n[i].text = e.target.value; setPollOptions(n); }} className="h-10 rounded-xl mb-2" />
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full h-12 rounded-xl font-black shadow-xl" onClick={handleCreatePoll}>Launch Poll</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
