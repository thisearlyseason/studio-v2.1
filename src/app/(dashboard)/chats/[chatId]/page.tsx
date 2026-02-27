
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  ChevronLeft, 
  Send, 
  BarChart2, 
  MoreVertical, 
  Sparkles,
  CheckCircle2,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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

const MOCK_MESSAGES = [
  { id: '1', author: 'Coach', content: 'Hey team, let\'s vote on the dinner spot for Friday.', type: 'text', createdAt: '10:00 AM' },
  { 
    id: '2', 
    author: 'Coach', 
    type: 'poll', 
    poll: {
      id: 'p1',
      question: 'Friday Night Team Dinner?',
      options: [
        { text: 'Luigi\'s Pizza', votes: 8 },
        { text: 'Burger Barn', votes: 4 },
        { text: 'Sushi Express', votes: 2 }
      ],
      totalVotes: 14,
      userVoted: 0,
      isClosed: false
    },
    createdAt: '10:01 AM'
  },
  { id: '3', author: 'Alex', content: 'I voted for pizza!', type: 'text', createdAt: '10:05 AM' },
];

export default function ChatRoomPage() {
  const { chatId } = useParams();
  const router = useRouter();
  const [messages, setMessages] = useState(MOCK_MESSAGES);
  const [input, setInput] = useState('');
  const [isPollDialogOpen, setIsPollDialogOpen] = useState(false);
  const [pollPrompt, setPollPrompt] = useState('');
  const [suggestedPoll, setSuggestedPoll] = useState<{question: string, options: string[]} | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = () => {
    if (!input.trim()) return;
    const newMessage = {
      id: Date.now().toString(),
      author: 'Me',
      content: input,
      type: 'text' as const,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages([...messages, newMessage]);
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

  const handleCreatePoll = () => {
    if (!suggestedPoll) return;
    const newMessage = {
      id: Date.now().toString(),
      author: 'Me',
      type: 'poll' as const,
      poll: {
        id: 'p' + Date.now(),
        question: suggestedPoll.question,
        options: suggestedPoll.options.map(o => ({ text: o, votes: 0 })),
        totalVotes: 0,
        userVoted: undefined as any,
        isClosed: false
      },
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages([...messages, newMessage]);
    setIsPollDialogOpen(false);
    setSuggestedPoll(null);
    setPollPrompt('');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-130px)] -mt-4 -mx-4">
      {/* Chat Header */}
      <div className="flex items-center gap-3 p-4 border-b bg-background sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => router.push('/chats')}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold truncate text-lg">General Discussion</h2>
          <p className="text-xs text-muted-foreground">22 Members online</p>
        </div>
        <Button variant="ghost" size="icon">
          <MoreVertical className="h-5 w-5" />
        </Button>
      </div>

      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex flex-col gap-1.5", msg.author === 'Me' ? 'items-end' : 'items-start')}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">{msg.author}</span>
              <span className="text-[10px] text-muted-foreground/50">{msg.createdAt}</span>
            </div>
            
            {msg.type === 'text' ? (
              <div className={cn(
                "max-w-[85%] p-3 rounded-2xl text-sm",
                msg.author === 'Me' 
                  ? "bg-primary text-primary-foreground rounded-tr-none" 
                  : "bg-muted text-foreground rounded-tl-none"
              )}>
                {msg.content}
              </div>
            ) : (
              <div className="w-full max-w-[90%] bg-card border rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-primary/5 p-4 border-b">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black text-primary uppercase tracking-widest">Active Poll</span>
                    <BarChart2 className="h-4 w-4 text-primary opacity-50" />
                  </div>
                  <h4 className="font-bold text-base leading-tight">{msg.poll?.question}</h4>
                </div>
                <div className="p-4 space-y-3">
                  {msg.poll?.options.map((opt, i) => (
                    <div key={i} className="relative group cursor-pointer" onClick={() => {}}>
                      <div className="flex justify-between text-xs font-medium mb-1 px-1">
                        <span className="flex items-center gap-1.5">
                          {msg.poll?.userVoted === i && <CheckCircle2 className="h-3 w-3 text-primary" />}
                          {opt.text}
                        </span>
                        <span className="text-muted-foreground">{opt.votes} votes</span>
                      </div>
                      <Progress value={msg.poll!.totalVotes > 0 ? (opt.votes / msg.poll!.totalVotes) * 100 : 0} className="h-2" />
                    </div>
                  ))}
                  <div className="pt-2 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-muted-foreground">{msg.poll?.totalVotes} Total Votes</span>
                    {msg.author === 'Me' && !msg.poll?.isClosed && (
                      <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold text-destructive hover:text-destructive">Close Poll</Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-background border-t space-y-4">
        <div className="flex items-center gap-2">
          <Dialog open={isPollDialogOpen} onOpenChange={setIsPollDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" className="shrink-0 rounded-full h-11 w-11 border-primary/30 text-primary">
                <BarChart2 className="h-5 w-5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Create a Poll</DialogTitle>
                <DialogDescription>
                  Ask the team a question. Use the AI assistant for suggestions.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Topic or Question</Label>
                  <div className="flex gap-2">
                    <Input 
                      placeholder="e.g. Where should we eat?" 
                      value={pollPrompt}
                      onChange={(e) => setPollPrompt(e.target.value)}
                    />
                    <Button 
                      variant="secondary" 
                      onClick={handleSuggestPoll} 
                      disabled={isGenerating || !pollPrompt.trim()}
                      className="bg-secondary/20 hover:bg-secondary/30"
                    >
                      {isGenerating ? "..." : <Sparkles className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {suggestedPoll && (
                  <div className="bg-muted p-4 rounded-lg space-y-3 animate-in fade-in slide-in-from-top-2">
                    <div className="flex justify-between items-center">
                      <Label className="text-xs font-bold text-primary uppercase">Suggested Question</Label>
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setSuggestedPoll(null)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="font-bold">{suggestedPoll.question}</p>
                    <div className="flex flex-wrap gap-2">
                      {suggestedPoll.options.map((opt, i) => (
                        <div key={i} className="bg-white px-2 py-1 rounded border text-xs">{opt}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button className="w-full" disabled={!suggestedPoll} onClick={handleCreatePoll}>Create Poll</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Input 
            className="flex-1 rounded-full bg-muted border-none h-11 px-6 focus-visible:ring-primary"
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          />
          <Button size="icon" className="shrink-0 rounded-full h-11 w-11" onClick={handleSendMessage}>
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
