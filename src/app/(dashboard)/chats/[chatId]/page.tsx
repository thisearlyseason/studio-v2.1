
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
  XCircle
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
import { useTeam } from '@/components/providers/team-provider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

export default function ChatRoomPage() {
  const { chatId } = useParams();
  const router = useRouter();
  const { chats, messages, addMessage, votePoll, setActiveChatId, user, formatTime, members } = useTeam();
  const [input, setInput] = useState('');
  const [isPollDialogOpen, setIsPollDialogOpen] = useState(false);
  const [pollPrompt, setPollPrompt] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [suggestedPoll, setSuggestedPoll] = useState<{question: string, options: string[]} | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [viewVotersFor, setViewVotersFor] = useState<{question: string, optionIdx: number, voterIds: string[]} | null>(null);
  const [chatImage, setChatImage] = useState<string | undefined>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentChat = useMemo(() => chats.find(c => c.id === chatId), [chats, chatId]);

  useEffect(() => {
    setActiveChatId(chatId as string);
    return () => setActiveChatId(null);
  }, [chatId, setActiveChatId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

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
    if ((!input.trim() && !chatImage) || !currentChat || !user) return;
    
    if (chatImage && !input.trim()) {
      addMessage(currentChat.id, user.name, '', 'image', chatImage);
    } else if (chatImage) {
      addMessage(currentChat.id, user.name, input, 'image', chatImage);
    } else {
      addMessage(currentChat.id, user.name, input, 'text');
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
    if (pollOptions.length < 6) setPollOptions([...pollOptions, '']);
  };

  const handleRemoveOption = (index: number) => {
    if (pollOptions.length > 2) setPollOptions(pollOptions.filter((_, i) => i !== index));
  };

  const handleUpdateOption = (index: number, value: string) => {
    const newOptions = [...pollOptions];
    newOptions[index] = value;
    setPollOptions(newOptions);
  };

  const handleCreatePoll = () => {
    if (!currentChat || !user) return;
    
    let question = pollPrompt;
    let options = pollOptions.filter(o => o.trim() !== '');

    if (suggestedPoll) {
      question = suggestedPoll.question;
      options = suggestedPoll.options;
    }

    if (!question || options.length < 2) {
      toast({ title: "Validation Error", description: "Poll needs a question and at least 2 options.", variant: "destructive" });
      return;
    }

    const pollData = {
      id: 'p' + Date.now(),
      question,
      options: options.map(o => ({ text: o, votes: 0 })),
      totalVotes: 0,
      voters: {},
      isClosed: false
    };

    addMessage(currentChat.id, user.name, '', 'poll', undefined, pollData);
    setIsPollDialogOpen(false);
    setSuggestedPoll(null);
    setPollPrompt('');
    setPollOptions(['', '']);
  };

  const handleVote = async (messageId: string, optionIdx: number) => {
    if (!currentChat) return;
    await votePoll(currentChat.id, messageId, optionIdx);
  };

  if (!currentChat) return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading discussion...</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-130px)] -mt-4 -mx-4">
      <div className="flex items-center gap-3 p-4 border-b bg-background sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => router.push('/chats')}><ChevronLeft className="h-5 w-5" /></Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold truncate text-lg">{currentChat.name}</h2>
          <p className="text-xs text-muted-foreground">{currentChat.memberIds.length} Members</p>
        </div>
        <Button variant="ghost" size="icon"><MoreVertical className="h-5 w-5" /></Button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((msg) => {
          const isMe = msg.authorId === user?.id || msg.author === user?.name;
          const isPoll = msg.type === 'poll' || !!msg.poll;

          return (
            <div key={msg.id} className={cn("flex flex-col gap-1.5", isMe ? 'items-end' : 'items-start')}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">{msg.author}</span>
                <span className="text-[10px] text-muted-foreground/50">{formatTime(msg.createdAt)}</span>
              </div>
              {!isPoll ? (
                <div className={cn("max-w-[85%] p-3 rounded-2xl text-sm shadow-sm space-y-2", isMe ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-muted text-foreground rounded-tl-none")}>
                  {msg.imageUrl && (
                    <div className="rounded-xl overflow-hidden border border-white/20 shadow-lg">
                      <img src={msg.imageUrl} alt="Chat attachment" className="w-full h-auto max-h-[300px] object-cover" />
                    </div>
                  )}
                  {msg.content && <p>{msg.content}</p>}
                </div>
              ) : (
                <div className="w-full max-w-[90%] bg-card border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all">
                  <div className="bg-primary/5 p-4 border-b">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-black text-primary uppercase tracking-widest">Active Poll</span>
                      <BarChart2 className="h-4 w-4 text-primary opacity-50" />
                    </div>
                    <h4 className="font-bold text-base leading-tight">{msg.poll?.question}</h4>
                  </div>
                  <div className="p-4 space-y-3">
                    {msg.poll?.options.map((opt, i) => {
                      const voters = Object.entries(msg.poll?.voters || {})
                        .filter(([_, votedIdx]) => votedIdx === i)
                        .map(([uid]) => uid);
                      const hasVoted = msg.poll?.voters?.[user?.id || ''] === i;

                      return (
                        <div key={i} className="space-y-1">
                          <button 
                            onClick={() => handleVote(msg.id, i)}
                            className={cn(
                              "w-full text-left relative group rounded-lg transition-all",
                              hasVoted ? "ring-2 ring-primary ring-offset-1" : "hover:bg-muted/50"
                            )}
                          >
                            <div className="flex justify-between text-xs font-bold mb-1 px-1">
                              <span className="flex items-center gap-2">
                                {opt.text}
                                {hasVoted && <div className="h-1.5 w-1.5 bg-primary rounded-full animate-pulse" />}
                              </span>
                              <span className="text-muted-foreground">{opt.votes} votes</span>
                            </div>
                            <Progress value={msg.poll!.totalVotes > 0 ? (opt.votes / msg.poll!.totalVotes) * 100 : 0} className="h-2" />
                          </button>
                          {voters.length > 0 && (
                            <Button 
                              variant="ghost" 
                              className="h-5 px-1 text-[9px] text-muted-foreground hover:text-primary flex items-center gap-1"
                              onClick={() => setViewVotersFor({ question: msg.poll!.question, optionIdx: i, voterIds: voters })}
                            >
                              <Users className="h-2.5 w-2.5" />
                              See who voted
                            </Button>
                          )}
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

      <div className="p-4 bg-background border-t">
        {chatImage && (
          <div className="mb-3 relative inline-block">
            <img src={chatImage} alt="Attachment preview" className="h-20 w-auto rounded-xl border-2 border-primary/20 shadow-md" />
            <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6 rounded-full" onClick={() => setChatImage(undefined)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
          <Button 
            variant="outline" 
            size="icon" 
            className="shrink-0 rounded-full h-11 w-11 border-primary/30 text-primary hover:bg-primary/10"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus className="h-5 w-5" />
          </Button>
          <Dialog open={isPollDialogOpen} onOpenChange={setIsPollDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" className="shrink-0 rounded-full h-11 w-11 border-primary/30 text-primary hover:bg-primary/10">
                <BarChart2 className="h-5 w-5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-3xl rounded-[2.5rem] overflow-hidden p-0">
              <div className="grid grid-cols-1 lg:grid-cols-2">
                <div className="p-8 bg-primary/5 border-r space-y-6">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-black">Quick Squad Poll</DialogTitle>
                    <DialogDescription className="font-bold text-primary/60 uppercase tracking-widest text-[10px]">Real-time coordination</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">The Topic</Label>
                      <div className="flex gap-2">
                        <Input placeholder="e.g. Venue for tournament?" value={pollPrompt} onChange={(e) => setPollPrompt(e.target.value)} className="h-12 rounded-xl bg-background" />
                        <Button variant="secondary" onClick={handleSuggestPoll} disabled={isGenerating || !pollPrompt.trim()} className="h-12 w-12 rounded-xl border border-primary/10">
                          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-primary" />}
                        </Button>
                      </div>
                    </div>
                    {suggestedPoll && (
                      <div className="bg-background p-6 rounded-2xl border-2 border-dashed border-primary/20 animate-in fade-in slide-in-from-top-2">
                        <div className="flex justify-between items-center mb-3">
                          <Label className="text-[10px] font-black text-primary uppercase tracking-widest">AI Generated Insight</Label>
                          <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full" onClick={() => setSuggestedPoll(null)}><X className="h-3 w-3" /></Button>
                        </div>
                        <p className="font-bold text-sm leading-tight mb-4">{suggestedPoll.question}</p>
                        <div className="flex flex-wrap gap-2">
                          {suggestedPoll.options.map((opt, i) => (<Badge key={i} variant="outline" className="bg-white px-2 py-1 rounded-lg border text-[10px] font-bold uppercase">{opt}</Badge>))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-8 space-y-6 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Poll Options</Label>
                      <Button variant="ghost" size="sm" onClick={handleAddOption} disabled={pollOptions.length >= 6} className="h-7 text-[10px] font-black uppercase tracking-widest text-primary"><Plus className="h-3 w-3 mr-1" /> Add</Button>
                    </div>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      {pollOptions.map((opt, i) => (
                        <div key={i} className="flex gap-2 group animate-in fade-in slide-in-from-left-2">
                          <Input placeholder={`Option ${i+1}`} value={opt} onChange={(e) => handleUpdateOption(i, e.target.value)} className="h-11 rounded-xl bg-muted/30 focus:bg-background transition-all" />
                          <Button variant="ghost" size="icon" className="h-11 w-11 rounded-xl text-destructive opacity-0 group-hover:opacity-100 transition-all" onClick={() => handleRemoveOption(i)} disabled={pollOptions.length <= 2}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all" onClick={handleCreatePoll}>Launch Discussion Poll</Button>
                  </DialogFooter>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Input className="flex-1 rounded-full bg-muted border-none h-11 px-6 shadow-inner" placeholder="Type a message..." value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} />
          <Button size="icon" className="shrink-0 rounded-full h-11 w-11 shadow-lg shadow-primary/20" onClick={handleSendMessage}><Send className="h-5 w-5" /></Button>
        </div>
      </div>

      <Dialog open={!!viewVotersFor} onOpenChange={() => setViewVotersFor(null)}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem] p-0 overflow-hidden">
          <div className="bg-primary/5 p-6 border-b flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-xl text-primary"><Users className="h-5 w-5" /></div>
              <div>
                <DialogTitle className="text-sm font-black uppercase tracking-widest">Option Voters</DialogTitle>
                <DialogDescription className="text-[9px] font-bold text-primary/60 tracking-widest uppercase">Discussion Insight</DialogDescription>
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
                    <div key={vid} className="flex items-center gap-3 p-3 bg-muted/20 rounded-2xl hover:bg-muted/30 transition-all border border-transparent hover:border-black/5">
                      <Avatar className="h-9 w-9 ring-2 ring-background">
                        <AvatarImage src={voter?.avatar} />
                        <AvatarFallback className="font-bold text-xs">{voter?.name?.[0] || '?'}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-black truncate">{voter?.name || 'Unknown'}</span>
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
              <Button variant="ghost" className="text-[10px] font-black uppercase tracking-widest h-9 px-8">Close Inbox</Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
