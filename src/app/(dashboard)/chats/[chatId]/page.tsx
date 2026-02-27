
"use client";

import React, { useState, useEffect, useRef } from 'react';
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
  Users
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
  DialogFooter
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { suggestPollQuestionAndOptions } from '@/ai/flows/poll-question-and-option-suggestion';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useTeam } from '@/components/providers/team-provider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';

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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveChatId(chatId as string);
    return () => setActiveChatId(null);
  }, [chatId, setActiveChatId]);

  const currentChat = chats.find(c => c.id === chatId);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = () => {
    if (!input.trim() || !currentChat || !user) return;
    addMessage(currentChat.id, user.name, input, 'text');
    setInput('');
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
      options: options.map(o => ({ text: o, votes: 0, voterIds: [] })),
      totalVotes: 0,
      voters: {},
      isClosed: false
    };

    addMessage(currentChat.id, user.name, '', 'poll', pollData);
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
          const isMe = msg.author === user?.name;
          return (
            <div key={msg.id} className={cn("flex flex-col gap-1.5", isMe ? 'items-end' : 'items-start')}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">{msg.author}</span>
                <span className="text-[10px] text-muted-foreground/50">{formatTime(msg.createdAt)}</span>
              </div>
              {msg.type === 'text' ? (
                <div className={cn("max-w-[85%] p-3 rounded-2xl text-sm shadow-sm", isMe ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-muted text-foreground rounded-tl-none")}>
                  {msg.content}
                </div>
              ) : (
                <div className="w-full max-w-[90%] bg-card border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
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
        <div className="flex items-center gap-2">
          <Dialog open={isPollDialogOpen} onOpenChange={setIsPollDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" className="shrink-0 rounded-full h-11 w-11 border-primary/30 text-primary hover:bg-primary/10">
                <BarChart2 className="h-5 w-5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] overflow-y-auto max-h-[90vh]">
              <DialogHeader>
                <DialogTitle>Create a Poll</DialogTitle>
                <DialogDescription>Ask the team a question. Enter options manually or use AI suggestions.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Topic or Question</Label>
                  <div className="flex gap-2">
                    <Input placeholder="e.g. Where should we eat?" value={pollPrompt} onChange={(e) => setPollPrompt(e.target.value)} />
                    <Button variant="secondary" onClick={handleSuggestPoll} disabled={isGenerating || !pollPrompt.trim()}>{isGenerating ? "..." : <Sparkles className="h-4 w-4" />}</Button>
                  </div>
                </div>

                {!suggestedPoll && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between"><Label className="text-xs font-bold uppercase text-muted-foreground">Options</Label><Button variant="ghost" size="sm" onClick={handleAddOption} disabled={pollOptions.length >= 6} className="h-7 text-[10px]"><Plus className="h-3 w-3 mr-1" /> Add</Button></div>
                    {pollOptions.map((opt, i) => (
                      <div key={i} className="flex gap-2 animate-in fade-in slide-in-from-left-2">
                        <Input placeholder={`Option ${i+1}`} value={opt} onChange={(e) => handleUpdateOption(i, e.target.value)} className="h-9 text-sm" />
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => handleRemoveOption(i)} disabled={pollOptions.length <= 2}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                  </div>
                )}

                {suggestedPoll && (
                  <div className="bg-muted p-4 rounded-lg space-y-3 animate-in fade-in slide-in-from-top-2">
                    <div className="flex justify-between items-center"><Label className="text-xs font-bold text-primary uppercase">Suggested Question</Label><Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setSuggestedPoll(null)}><X className="h-3 w-3" /></Button></div>
                    <p className="font-bold">{suggestedPoll.question}</p>
                    <div className="flex flex-wrap gap-2">{suggestedPoll.options.map((opt, i) => (<div key={i} className="bg-white px-2 py-1 rounded border text-xs">{opt}</div>))}</div>
                  </div>
                )}
              </div>
              <DialogFooter><Button className="w-full" onClick={handleCreatePoll}>Create Poll</Button></DialogFooter>
            </DialogContent>
          </Dialog>
          <Input className="flex-1 rounded-full bg-muted border-none h-11 px-6 shadow-inner" placeholder="Type a message..." value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} />
          <Button size="icon" className="shrink-0 rounded-full h-11 w-11 shadow-lg shadow-primary/20" onClick={handleSendMessage}><Send className="h-5 w-5" /></Button>
        </div>
      </div>

      <Dialog open={!!viewVotersFor} onOpenChange={() => setViewVotersFor(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">Voters for this option</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[300px] mt-2">
            <div className="space-y-3 p-1">
              {viewVotersFor?.voterIds.map(vid => {
                const voter = members.find(m => m.id === vid);
                return (
                  <div key={vid} className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={voter?.avatar} />
                      <AvatarFallback>{voter?.name?.[0] || '?'}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold">{voter?.name || 'Unknown'}</span>
                      <span className="text-[10px] text-muted-foreground">{voter?.position || 'Member'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
