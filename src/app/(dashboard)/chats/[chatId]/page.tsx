
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
  ImageIcon
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
  const [viewVotersFor, setViewVotersFor] = useState<{question: string, optionIdx: number, voterIds: string[]} | null>(null);
  const [chatImage, setChatImage] = useState<string | undefined>();
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const optionImageInputRef = useRef<HTMLInputElement>(null);
  const activeOptionIdxRef = useRef<number | null>(null);

  // Memoized Chat Metadata Ref
  const chatDocRef = useMemoFirebase(() => {
    if (!activeTeam || !db || !chatId) return null;
    return doc(db, 'teams', activeTeam.id, 'groupChats', chatId as string);
  }, [activeTeam?.id, db, chatId]);

  const { data: currentChat } = useDoc(chatDocRef);

  // Memoized Messages Query
  const messagesQuery = useMemoFirebase(() => {
    if (!activeTeam || !db || !chatId) return null;
    return query(
      collection(db, 'teams', activeTeam.id, 'groupChats', chatId as string, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(100)
    );
  }, [activeTeam?.id, db, chatId]);

  const { data: messages = [] } = useCollection<Message>(messagesQuery);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages?.length]);

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          let width = img.width;
          let height = img.height;
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
      };
    });
  };

  const handleSendMessage = () => {
    if ((!input.trim() && !chatImage) || !chatId || !user) return;
    
    if (chatImage && !input.trim()) {
      addMessage(chatId as string, user.name, '', 'image', chatImage);
    } else if (chatImage) {
      addMessage(chatId as string, user.name, input, 'image', chatImage);
    } else {
      addMessage(chatId as string, user.name, input, 'text');
    }
    
    setInput('');
    setChatImage(undefined);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const compressed = await compressImage(e.target.files[0]);
      setChatImage(compressed);
    }
  };

  const handleOptionImageClick = (idx: number) => {
    activeOptionIdxRef.current = idx;
    optionImageInputRef.current?.click();
  };

  const handleOptionImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && activeOptionIdxRef.current !== null) {
      const compressed = await compressImage(e.target.files[0]);
      const newOpts = [...pollOptions];
      newOpts[activeOptionIdxRef.current].image = compressed;
      setPollOptions(newOpts);
    }
  };

  const handleSuggestPoll = async () => {
    if (!pollPrompt.trim()) return;
    setIsGenerating(true);
    try {
      const result = await suggestPollQuestionAndOptions({ prompt: pollPrompt });
      setSuggestedPoll(result);
    } catch (error) {
      toast({ title: "Error", description: "Failed to generate poll suggestions.", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddOption = () => {
    if (pollOptions.length < 6) setPollOptions([...pollOptions, {text: '', image: undefined}]);
  };

  const handleRemoveOption = (index: number) => {
    if (pollOptions.length > 2) setPollOptions(pollOptions.filter((_, i) => i !== index));
  };

  const handleUpdateOption = (index: number, value: string) => {
    const newOptions = [...pollOptions];
    newOptions[index].text = value;
    setPollOptions(newOptions);
  };

  const handleCreatePoll = () => {
    if (!chatId || !user) return;
    
    let question = pollPrompt;
    let finalOptions = pollOptions.filter(o => o.text.trim() !== '');

    if (suggestedPoll) {
      question = suggestedPoll.question;
      finalOptions = suggestedPoll.options.map(o => ({text: o, image: undefined}));
    }

    if (!question || finalOptions.length < 2) {
      toast({ title: "Validation Error", description: "Poll needs a question and at least 2 options.", variant: "destructive" });
      return;
    }

    const pollData = {
      id: 'p' + Date.now(),
      question,
      options: finalOptions.map(o => ({ text: o.text, imageUrl: o.image, votes: 0 })),
      totalVotes: 0,
      voters: {},
      isClosed: false
    };

    addMessage(chatId as string, user.name, '', 'poll', undefined, pollData);
    setIsPollDialogOpen(false);
    setSuggestedPoll(null);
    setPollPrompt('');
    setPollOptions([{text: '', image: undefined}, {text: '', image: undefined}]);
  };

  const handleVote = async (messageId: string, optionIdx: number) => {
    if (!chatId) return;
    await votePoll(chatId as string, messageId, optionIdx);
  };

  if (!currentChat) return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm font-black text-muted-foreground uppercase tracking-widest">Opening discussion...</p>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-130px)] -mt-4 -mx-4">
      <div className="flex items-center gap-3 p-4 border-b bg-background sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => router.push('/chats')} className="rounded-full"><ChevronLeft className="h-5 w-5" /></Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-black truncate text-lg tracking-tight">{currentChat.name}</h2>
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{currentChat.memberIds?.length || 0} Members</p>
        </div>
        <Button variant="ghost" size="icon" className="rounded-full"><MoreVertical className="h-5 w-5" /></Button>
      </div>

      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="p-4 space-y-6">
          {messages?.map((msg) => {
            const isMe = msg.authorId === user?.id || msg.author === user?.name;
            const isPoll = (msg.type === 'poll' || !!msg.poll) && msg.poll;
            const hasOptionImages = isPoll && msg.poll?.options.some(o => o.imageUrl);

            return (
              <div key={msg.id} className={cn("flex flex-col gap-1.5", isMe ? 'items-end' : 'items-start')}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">{msg.author}</span>
                  <span className="text-[9px] text-muted-foreground/50 font-bold">{formatTime(msg.createdAt)}</span>
                </div>
                {!isPoll ? (
                  <div className={cn("max-w-[85%] p-3.5 rounded-2xl text-sm shadow-sm space-y-2", isMe ? "bg-primary text-white rounded-tr-none" : "bg-muted text-foreground rounded-tl-none")}>
                    {msg.imageUrl && (
                      <div className="rounded-xl overflow-hidden border-2 border-white/20 shadow-lg">
                        <img src={msg.imageUrl} alt="Chat attachment" className="w-full h-auto max-h-[300px] object-cover" />
                      </div>
                    )}
                    {msg.content && <p className="font-medium leading-relaxed">{msg.content}</p>}
                  </div>
                ) : (
                  <div className="w-full max-w-[90%] bg-card border-2 rounded-[2rem] overflow-hidden shadow-md hover:shadow-xl transition-all">
                    <div className="bg-primary/5 p-5 border-b">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-black text-primary uppercase tracking-[0.2em]">Active Squad Poll</span>
                        <BarChart2 className="h-4 w-4 text-primary opacity-50" />
                      </div>
                      <h4 className="font-black text-lg leading-tight tracking-tight">{msg.poll?.question}</h4>
                    </div>
                    <div className={cn("p-5", hasOptionImages ? "grid grid-cols-1 sm:grid-cols-2 gap-4" : "space-y-4")}>
                      {msg.poll?.options.map((opt, i) => {
                        const voters = Object.entries(msg.poll?.voters || {})
                          .filter(([_, votedIdx]) => votedIdx === i)
                          .map(([uid]) => uid);
                        const hasVoted = msg.poll?.voters?.[user?.id || ''] === i;
                        const percentage = msg.poll!.totalVotes > 0 ? (opt.votes / msg.poll!.totalVotes) * 100 : 0;

                        return (
                          <div key={i} className={cn("relative group", hasOptionImages ? "bg-muted/20 rounded-3xl overflow-hidden flex flex-col border-2 border-transparent hover:border-primary/10 transition-all" : "")}>
                            {hasOptionImages && (
                              <div className="relative aspect-video overflow-hidden cursor-zoom-in" onClick={() => opt.imageUrl && setLightboxImage(opt.imageUrl)}>
                                {opt.imageUrl ? (
                                  <img src={opt.imageUrl} className="w-full h-full object-cover" alt={opt.text} />
                                ) : (
                                  <div className="w-full h-full bg-muted flex items-center justify-center">
                                    <ImageIcon className="h-6 w-6 text-muted-foreground/20" />
                                  </div>
                                )}
                              </div>
                            )}
                            
                            <div className={cn("p-3 space-y-3", !hasOptionImages && "w-full")}>
                              <button 
                                onClick={() => handleVote(msg.id, i)}
                                className={cn(
                                  "w-full text-left relative transition-all p-1",
                                  hasVoted ? "ring-2 ring-primary ring-offset-2 rounded-xl" : "hover:bg-muted/50 rounded-xl"
                                )}
                              >
                                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-2 px-1">
                                  <span className="flex items-center gap-2">
                                    {opt.text}
                                    {hasVoted && <div className="h-2 w-2 bg-primary rounded-full animate-pulse" />}
                                  </span>
                                  <span className="text-primary">{opt.votes}</span>
                                </div>
                                <div className="relative">
                                  <Progress value={percentage} className="h-2.5 rounded-full" />
                                  {voters.length > 0 && (
                                    <div className="absolute -top-1 -right-1 flex -space-x-2">
                                      {voters.slice(0, 3).map(vid => {
                                        const v = members.find(m => m.userId === vid);
                                        return (
                                          <Avatar key={vid} className="h-5 w-5 border-2 border-background shadow-sm">
                                            <AvatarImage src={v?.avatar} />
                                            <AvatarFallback className="text-[6px] font-black">{v?.name?.[0]}</AvatarFallback>
                                          </Avatar>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </button>
                              {voters.length > 0 && (
                                <Button 
                                  variant="ghost" 
                                  className="h-6 px-2 text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary flex items-center gap-1.5"
                                  onClick={() => setViewVotersFor({ question: msg.poll!.question, optionIdx: i, voterIds: voters })}
                                >
                                  <Users className="h-3 w-3" /> Breakdown
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <div className="p-4 bg-background border-t">
        {chatImage && (
          <div className="mb-3 relative inline-block">
            <img src={chatImage} alt="Attachment preview" className="h-24 w-auto rounded-2xl border-4 border-primary/10 shadow-xl" />
            <Button variant="destructive" size="icon" className="absolute -top-3 -right-3 h-7 w-7 rounded-full shadow-lg" onClick={() => setChatImage(undefined)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        <div className="flex items-center gap-3">
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
          <Button 
            variant="outline" 
            size="icon" 
            className="shrink-0 rounded-full h-12 w-12 border-primary/20 text-primary hover:bg-primary/5 shadow-sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus className="h-5 w-5" />
          </Button>
          <Dialog open={isPollDialogOpen} onOpenChange={setIsPollDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" className="shrink-0 rounded-full h-12 w-12 border-primary/20 text-primary hover:bg-primary/5 shadow-sm">
                <BarChart2 className="h-5 w-5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-4xl rounded-[2.5rem] overflow-hidden p-0 max-h-[95vh] flex flex-col border-none shadow-2xl">
              <DialogTitle className="sr-only">Create Discussion Poll</DialogTitle>
              <DialogDescription className="sr-only">Define a question and options for your squad to vote on.</DialogDescription>
              <div className="overflow-y-auto flex-1 custom-scrollbar">
                <div className="grid grid-cols-1 lg:grid-cols-2 h-full">
                  <div className="p-8 bg-primary/5 border-r space-y-6">
                    <DialogHeader>
                      <DialogTitle className="text-2xl font-black tracking-tight">Quick Squad Poll</DialogTitle>
                      <DialogDescription className="font-black text-primary/60 uppercase tracking-widest text-[10px]">Real-time coordination</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">The Topic</Label>
                        <div className="flex gap-3">
                          <Input placeholder="e.g. Venue for tournament?" value={pollPrompt} onChange={(e) => setPollPrompt(e.target.value)} className="h-12 rounded-xl bg-background border-2 font-black" />
                          <Button variant="secondary" onClick={handleSuggestPoll} disabled={isGenerating || !pollPrompt.trim()} className="h-12 w-12 rounded-xl border-2 shadow-sm shrink-0">
                            {isGenerating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5 text-primary" />}
                          </Button>
                        </div>
                      </div>
                      {suggestedPoll && (
                        <div className="bg-background p-6 rounded-3xl border-2 border-dashed border-primary/20 animate-in fade-in slide-in-from-top-4">
                          <div className="flex justify-between items-center mb-4">
                            <Label className="text-[10px] font-black text-primary uppercase tracking-widest">AI Generated Insight</Label>
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => setSuggestedPoll(null)}><X className="h-4 w-4" /></Button>
                          </div>
                          <p className="font-black text-sm leading-tight mb-5">{suggestedPoll.question}</p>
                          <div className="flex flex-wrap gap-2">
                            {suggestedPoll.options.map((opt, i) => (<Badge key={i} variant="outline" className="bg-white px-3 py-1.5 rounded-xl border-2 text-[10px] font-black uppercase">{opt}</Badge>))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="p-8 space-y-6 flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Poll Options</Label>
                        <Button variant="ghost" size="sm" onClick={handleAddOption} disabled={pollOptions.length >= 6} className="h-7 text-[10px] font-black uppercase text-primary hover:bg-primary/5"><Plus className="h-3 w-3 mr-1" /> Add</Button>
                      </div>
                      <div className="space-y-3">
                        <input type="file" ref={optionImageInputRef} className="hidden" accept="image/*" onChange={handleOptionImageChange} />
                        {pollOptions.map((opt, i) => (
                          <div key={i} className="flex flex-col gap-3 group animate-in fade-in slide-in-from-left-4">
                            <div className="flex gap-3">
                              <Input placeholder={`Option ${i+1}`} value={opt.text} onChange={(e) => handleUpdateOption(i, e.target.value)} className="h-12 rounded-xl bg-muted/30 focus:bg-background border-2 font-black transition-all" />
                              <Button variant="ghost" size="icon" className="h-12 w-12 rounded-xl bg-muted/20 text-muted-foreground shrink-0" onClick={() => handleOptionImageClick(i)}>
                                <ImageIcon className="h-5 w-5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-12 w-12 rounded-xl text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0" onClick={() => handleRemoveOption(i)} disabled={pollOptions.length <= 2}><Trash2 className="h-5 w-5" /></Button>
                            </div>
                            {opt.image && (
                              <div className="relative inline-block ml-1">
                                <img src={opt.image} className="h-12 w-12 rounded-xl object-cover border-2 border-primary/20 shadow-md" alt="Option preview" />
                                <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-5 w-5 rounded-full shadow-lg" onClick={() => { const newOpts = [...pollOptions]; newOpts[i].image = undefined; setPollOptions(newOpts); }}><X className="h-3 w-3" /></Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <DialogFooter>
                      <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all mt-6" onClick={handleCreatePoll}>Launch Discussion Poll</Button>
                    </DialogFooter>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Input className="flex-1 rounded-full bg-muted border-none h-12 px-6 shadow-inner font-medium text-base" placeholder="Type a message..." value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} />
          <Button size="icon" className="shrink-0 rounded-full h-12 w-12 shadow-xl shadow-primary/20 active:scale-90 transition-all" onClick={handleSendMessage}><Send className="h-5 w-5" /></Button>
        </div>
      </div>

      <Dialog open={!!viewVotersFor} onOpenChange={() => setViewVotersFor(null)}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-primary/5 p-6 border-b flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2.5 rounded-xl text-primary"><Users className="h-5 w-5" /></div>
              <div>
                <DialogTitle className="text-sm font-black uppercase tracking-widest leading-none">Option Voters</DialogTitle>
                <DialogDescription className="text-[9px] font-bold text-primary/60 tracking-widest uppercase mt-1">Discussion Insight</DialogDescription>
              </div>
            </div>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" className="rounded-full h-8 w-8"><XCircle className="h-5 w-5 text-muted-foreground" /></Button>
            </DialogClose>
          </div>
          <ScrollArea className="max-h-[400px]">
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {viewVotersFor?.voterIds.map(vid => {
                  const voter = members.find(m => m.userId === vid);
                  return (
                    <div key={vid} className="flex items-center gap-3 p-3 bg-muted/20 rounded-2xl hover:bg-muted/30 transition-all border-2 border-transparent hover:border-primary/5">
                      <Avatar className="h-10 w-10 ring-2 ring-background shadow-sm">
                        <AvatarImage src={voter?.avatar} />
                        <AvatarFallback className="font-black text-xs">{voter?.name?.[0] || '?'}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-black truncate tracking-tight">{voter?.name || 'Unknown'}</span>
                        <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">{voter?.position || 'Member'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </ScrollArea>
          <div className="p-4 bg-muted/10 border-t flex justify-center">
            <DialogClose asChild>
              <Button variant="ghost" className="text-[10px] font-black uppercase tracking-widest h-10 px-8">Close Overview</Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>

      {/* Option Image Lightbox */}
      <Dialog open={!!lightboxImage} onOpenChange={(open) => !open && setLightboxImage(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl p-0 overflow-hidden bg-black/95 border-none rounded-[2.5rem]">
          <DialogTitle className="sr-only">Poll Media Preview</DialogTitle>
          <DialogDescription className="sr-only">Full-sized version of the chat poll option media.</DialogDescription>
          {lightboxImage && (
            <div className="relative group">
              <img src={lightboxImage} className="w-full h-auto max-h-[85vh] object-contain animate-in zoom-in-95 duration-300" alt="Full size" />
              <Button variant="ghost" size="icon" className="absolute top-6 right-6 text-white hover:bg-white/20 rounded-full" onClick={() => setLightboxImage(null)}><X className="h-6 w-6" /></Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
