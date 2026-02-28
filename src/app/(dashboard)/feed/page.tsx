
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  ImagePlus, 
  MessageSquare, 
  Trash2, 
  Calendar, 
  Send, 
  Heart, 
  Camera, 
  Loader2, 
  Info, 
  X, 
  MapPin, 
  Clock, 
  Trophy, 
  ChevronRight,
  Users,
  BarChart2,
  Sparkles,
  Plus
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { formatDistanceToNow, format } from 'date-fns';
import { useTeam, Comment, Post } from '@/components/providers/team-provider';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

function CommentList({ postId, teamId, isAdmin, currentUserId }: { postId: string, teamId: string, isAdmin: boolean, currentUserId: string }) {
  const { deleteComment } = useTeam();
  const db = useFirestore();
  const q = useMemoFirebase(() => {
    return query(
      collection(db, 'teams', teamId, 'feedPosts', postId, 'comments'),
      orderBy('createdAt', 'asc')
    );
  }, [db, teamId, postId]);
  
  const { data: comments, isLoading } = useCollection<Comment>(q);

  if (isLoading) return <div className="p-2 text-[10px] text-muted-foreground animate-pulse">Loading comments...</div>;
  if (!comments || comments.length === 0) return null;

  return (
    <div className="space-y-3 mt-4">
      {comments.map((comment) => (
        <div key={comment.id} className="flex gap-3 items-start animate-in fade-in slide-in-from-left-2 duration-300 group">
          <Avatar className="h-7 w-7 shrink-0 border border-muted">
            <AvatarFallback className="text-[10px] font-bold">{comment.authorName[0]}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 bg-muted/30 p-2.5 rounded-2xl relative">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] font-black tracking-tight">{comment.authorName}</span>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-muted-foreground">{formatDistanceToNow(new Date(comment.createdAt))} ago</span>
                {(isAdmin || comment.authorId === currentUserId) && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                    onClick={() => deleteComment(postId, comment.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs font-medium text-foreground/80 leading-snug">{comment.content}</p>
            {comment.imageUrl && (
              <div className="mt-2 rounded-xl overflow-hidden border border-muted shadow-sm max-w-[200px]">
                <img src={comment.imageUrl} alt="Comment attachment" className="w-full h-auto" />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FeedPage() {
  const { activeTeam, posts, addPost, deletePost, addComment, toggleLike, votePostPoll, user, updateTeamHero, formatTime, isSuperAdmin, events, games, members } = useTeam();
  const router = useRouter();
  const [newPostContent, setNewPostContent] = useState('');
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [commentInputs, setCommentInputs] = useState<{ [key: string]: string }>({});
  const [commentImages, setCommentImages] = useState<{ [key: string]: string }>({});
  const [mounted, setMounted] = useState(false);
  const [isUpdatingHero, setIsUpdatingHero] = useState(false);
  
  // Poll State
  const [isPollDialogOpen, setIsPollDialogOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [viewVotersFor, setViewVotersFor] = useState<{question: string, optionIdx: number, voterIds: string[]} | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);
  const commentFileInputRef = useRef<{ [key: string]: HTMLInputElement | null }>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !activeTeam) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-pulse">
        <div className="h-12 w-12 bg-primary/10 rounded-full mb-4" />
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Preparing your feed...</p>
      </div>
    );
  }

  const isAdmin = activeTeam?.role === 'Admin' || isSuperAdmin;

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1200;
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

  const handlePost = () => {
    if (!newPostContent.trim() && !imageUrl) return;
    addPost(newPostContent, imageUrl);
    setNewPostContent('');
    setImageUrl(undefined);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const compressed = await compressImage(e.target.files[0]);
      setImageUrl(compressed);
    }
  };

  const handleCreatePoll = () => {
    const validOptions = pollOptions.filter(o => o.trim() !== '');
    if (!pollQuestion || validOptions.length < 2) {
      toast({ title: "Validation Error", description: "Poll needs a question and at least 2 options.", variant: "destructive" });
      return;
    }

    const pollData = {
      id: 'p' + Date.now(),
      question: pollQuestion,
      options: validOptions.map(o => ({ text: o, votes: 0 })),
      totalVotes: 0,
      voters: {},
      isClosed: false
    };

    addPost(pollQuestion, undefined, 'poll', undefined, pollData);
    setIsPollDialogOpen(false);
    setPollQuestion('');
    setPollOptions(['', '']);
  };

  const handleAddPollOption = () => {
    if (pollOptions.length < 6) setPollOptions([...pollOptions, '']);
  };

  const handleRemovePollOption = (idx: number) => {
    if (pollOptions.length > 2) setPollOptions(pollOptions.filter((_, i) => i !== idx));
  };

  async function handleHeroChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files[0]) {
      setIsUpdatingHero(true);
      try {
        const compressed = await compressImage(e.target.files[0]);
        await updateTeamHero(compressed);
        toast({ title: "Hero Updated", description: "Team banner updated successfully." });
      } catch (error) {
        toast({ title: "Update Failed", description: "Could not update team hero image.", variant: "destructive" });
      } finally {
        setIsUpdatingHero(false);
      }
    }
  }

  function handleCommentFileChange(postId: string, e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files[0]) {
      compressImage(e.target.files[0]).then(compressed => {
        setCommentImages(prev => ({ ...prev, [postId]: compressed }));
      });
    }
  }

  function handleCommentSubmit(postId: string) {
    const content = commentInputs[postId];
    const image = commentImages[postId];
    if (!content?.trim() && !image) return;
    addComment(postId, content || '', image);
    setCommentInputs(prev => ({ ...prev, [postId]: '' }));
    setCommentImages(prev => {
      const updated = { ...prev };
      delete updated[postId];
      return updated;
    });
  }

  return (
    <div className="flex flex-col lg:flex-row gap-8 pb-12 animate-in fade-in duration-500">
      <div className="flex-1 space-y-8 min-w-0">
        <section className="relative h-48 sm:h-64 lg:h-80 rounded-[2.5rem] overflow-hidden shadow-2xl group ring-1 ring-black/5">
          <img src={activeTeam.heroImageUrl || "https://picsum.photos/seed/squadhero/1200/400"} alt="Team Hero" className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          {isAdmin && (
            <div className="absolute top-6 right-6 z-20">
              <input type="file" ref={heroInputRef} className="hidden" accept="image/*" onChange={handleHeroChange} />
              <Button variant="secondary" size="sm" disabled={isUpdatingHero} className="bg-white/20 backdrop-blur-md text-white hover:bg-white/40 border-none rounded-full h-10 transition-all active:scale-95 shadow-lg px-5 font-bold" onClick={() => heroInputRef.current?.click()}>
                {isUpdatingHero ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
                {isUpdatingHero ? "Uploading..." : "Change Cover"}
              </Button>
            </div>
          )}
          <div className="absolute bottom-8 left-8 right-8 flex items-end justify-between">
            <div className="space-y-1">
              <Badge variant="secondary" className="mb-2 bg-white/20 backdrop-blur-md text-white border-none font-black uppercase tracking-wider text-[10px]">Active Squad</Badge>
              <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tighter drop-shadow-lg leading-none">{activeTeam.name}</h1>
              <p className="text-white/70 text-base font-medium hidden sm:block">Join the discussion, coordinate the win.</p>
            </div>
          </div>
        </section>

        <Card className="rounded-[3rem] border-none shadow-xl shadow-primary/5 ring-1 ring-black/5 overflow-hidden">
          <CardContent className="p-8 pb-10">
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              <Avatar className="h-12 w-12 shrink-0 border-2 border-primary/10 shadow-sm">
                <AvatarImage src={user?.avatar} />
                <AvatarFallback className="font-black">{user?.name?.[0] || '?'}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 w-full">
                <Textarea 
                  placeholder={`What's the play for ${activeTeam.name}?`} 
                  value={newPostContent} 
                  onChange={(e) => setNewPostContent(e.target.value)} 
                  className="min-h-[100px] w-full resize-none border-none focus-visible:ring-0 p-0 text-lg sm:text-xl font-medium placeholder:text-muted-foreground/30 bg-transparent leading-relaxed" 
                />
                
                {imageUrl && (
                  <div className="mt-4 relative rounded-3xl overflow-hidden border-4 border-white shadow-lg animate-in zoom-in-95">
                    <img src={imageUrl} alt="Preview" className="w-full h-auto object-cover max-h-[500px]" />
                    <Button variant="destructive" size="icon" className="absolute top-4 right-4 h-10 w-10 rounded-full shadow-lg" onClick={() => setImageUrl(undefined)}><X className="h-5 w-5" /></Button>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-8 mt-4 border-t border-muted/50">
                  <div className="flex items-center gap-4">
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-12 px-6 rounded-full font-black uppercase text-[10px] tracking-widest text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all" 
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImagePlus className="h-4 w-4 mr-2" /> Media
                    </Button>
                    <Dialog open={isPollDialogOpen} onOpenChange={setIsPollDialogOpen}>
                      <DialogTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-12 px-6 rounded-full font-black uppercase text-[10px] tracking-widest text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all"
                        >
                          <BarChart2 className="h-4 w-4 mr-2" /> Poll
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md rounded-3xl">
                        <DialogHeader>
                          <DialogTitle>Create Squad Poll</DialogTitle>
                          <DialogDescription>Ask your team a question and track the vote.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label>Question</Label>
                            <Input placeholder="e.g. Best time for practice?" value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} className="rounded-xl h-11" />
                          </div>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between"><Label className="text-xs font-black uppercase text-muted-foreground">Options</Label><Button variant="ghost" size="sm" onClick={handleAddPollOption} disabled={pollOptions.length >= 6} className="h-7 text-[10px] font-black uppercase"><Plus className="h-3 w-3 mr-1" /> Add</Button></div>
                            {pollOptions.map((opt, i) => (
                              <div key={i} className="flex gap-2">
                                <Input placeholder={`Option ${i+1}`} value={opt} onChange={e => { const newOpts = [...pollOptions]; newOpts[i] = e.target.value; setPollOptions(newOpts); }} className="rounded-lg h-9 text-sm" />
                                <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => handleRemovePollOption(i)} disabled={pollOptions.length <= 2}><Trash2 className="h-4 w-4" /></Button>
                              </div>
                            ))}
                          </div>
                        </div>
                        <DialogFooter><Button className="w-full rounded-xl h-12 text-base font-black" onClick={handleCreatePoll}>Launch Poll</Button></DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <Button 
                    disabled={!newPostContent.trim() && !imageUrl} 
                    onClick={handlePost} 
                    className="w-full sm:w-auto rounded-full px-10 h-12 font-black uppercase text-[11px] tracking-[0.15em] shadow-xl shadow-primary/20 transition-all active:scale-95 shrink-0"
                  >
                    Post to Squad
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-8">
          {posts.map((post) => {
            const isLiked = post.likes?.includes(user?.id || '');
            const canDelete = isAdmin || (post.authorId === user?.id);

            return (
              <Card key={post.id} className={cn("rounded-[2.5rem] border-none shadow-md overflow-hidden transition-all duration-500 hover:shadow-2xl ring-1 ring-black/5 group", post.type === 'system' ? 'bg-amber-50 dark:bg-amber-950/20 ring-amber-500/10' : '')}>
                {post.type !== 'system' && (
                  <CardHeader className="flex flex-row items-center gap-5 pb-4 pt-8 px-8">
                    <Avatar className="h-12 w-12 border-2 border-background shadow-md">
                      <AvatarImage src={post.author?.avatar} />
                      <AvatarFallback className="font-black">{post.author?.name?.[0] || '?'}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-base tracking-tight leading-none">{post.author?.name || 'Anonymous'}</div>
                      <div className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mt-1.5 flex items-center gap-2">
                        {post.createdAt ? formatDistanceToNow(new Date(post.createdAt)) + ' ago' : 'Live'}
                        <div className="h-1 w-1 bg-muted-foreground/30 rounded-full" />
                        {formatTime(post.createdAt)}
                      </div>
                    </div>
                    {canDelete && (
                      <Button variant="ghost" size="icon" className="h-10 w-10 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/10 rounded-full" onClick={() => deletePost(post.id)}><Trash2 className="h-5 w-5" /></Button>
                    )}
                  </CardHeader>
                )}
                <CardContent className={post.type === 'system' ? 'p-0' : 'pt-2 pb-6 px-8'}>
                  {post.type === 'poll' ? (
                    <div className="w-full bg-card border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all">
                      <div className="bg-primary/5 p-4 border-b">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-black text-primary uppercase tracking-widest">Squad Poll</span>
                          <BarChart2 className="h-4 w-4 text-primary opacity-50" />
                        </div>
                        <h4 className="font-bold text-lg leading-tight">{post.poll?.question}</h4>
                      </div>
                      <div className="p-4 space-y-3">
                        {post.poll?.options.map((opt, i) => {
                          const voters = Object.entries(post.poll?.voters || {})
                            .filter(([_, votedIdx]) => votedIdx === i)
                            .map(([uid]) => uid);
                          const hasVoted = post.poll?.voters?.[user?.id || ''] === i;

                          return (
                            <div key={i} className="space-y-1">
                              <button onClick={() => votePostPoll(post.id, i)} className={cn("w-full text-left relative group rounded-lg transition-all", hasVoted ? "ring-2 ring-primary ring-offset-1" : "hover:bg-muted/50")}>
                                <div className="flex justify-between text-xs font-bold mb-1 px-1">
                                  <span className="flex items-center gap-2">
                                    {opt.text}
                                    {hasVoted && <div className="h-1.5 w-1.5 bg-primary rounded-full animate-pulse" />}
                                  </span>
                                  <span className="text-muted-foreground">{opt.votes} votes</span>
                                </div>
                                <Progress value={post.poll!.totalVotes > 0 ? (opt.votes / post.poll!.totalVotes) * 100 : 0} className="h-2" />
                              </button>
                              {voters.length > 0 && (
                                <Button variant="ghost" className="h-5 px-1 text-[9px] text-muted-foreground hover:text-primary flex items-center gap-1" onClick={() => setViewVotersFor({ question: post.poll!.question, optionIdx: i, voterIds: voters })}>
                                  <Users className="h-2.5 w-2.5" /> See who voted
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : post.type === 'system' ? (
                    <div className="p-6 sm:p-10">
                      {post.systemData ? (
                        <div className="bg-white dark:bg-background rounded-[2rem] border-2 border-amber-500/20 shadow-lg overflow-hidden animate-in zoom-in-95">
                          <div className="bg-amber-100 dark:bg-amber-900/40 py-2.5 px-6 flex justify-center">
                            <span className="text-[10px] font-black uppercase text-amber-700 dark:text-amber-400 tracking-[0.3em]">{post.systemData.updateType}</span>
                          </div>
                          <div className="p-8 flex flex-col sm:flex-row items-center gap-8">
                            <div className="flex flex-col items-center justify-center border-r-0 sm:border-r pr-0 sm:pr-10 min-w-[120px] text-center">
                              <span className="text-sm font-black text-foreground/40 uppercase tracking-widest">{format(new Date(post.systemData.date), 'EEE')}</span>
                              <span className="text-4xl font-black text-foreground tracking-tighter my-1">{format(new Date(post.systemData.date), 'MM/dd')}</span>
                              <span className="text-[10px] font-black uppercase text-amber-600 mt-2 tracking-widest">{post.systemData.label || 'GAME UPDATE'}</span>
                            </div>
                            <div className="flex-1 space-y-4 text-center sm:text-left">
                              <h3 className="text-2xl font-black text-foreground tracking-tight leading-none">{post.systemData.title}</h3>
                              {post.systemData.detail && <p className="text-xs font-black text-amber-700 dark:text-amber-400/80 bg-amber-500/10 py-1.5 px-4 rounded-full inline-block uppercase tracking-widest">{post.systemData.detail}</p>}
                              <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start text-xs font-bold text-muted-foreground uppercase tracking-[0.1em]">
                                <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-amber-500" /> {post.systemData.startTime}{post.systemData.endTime ? ` - ${post.systemData.endTime}` : ''}</div>
                                <div className="flex items-center gap-2 truncate max-w-xs"><MapPin className="h-4 w-4 text-amber-500" /> {post.systemData.location}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-6 p-2">
                          <div className="bg-amber-100 dark:bg-amber-900/40 p-4 rounded-[1.5rem] text-amber-600 dark:text-amber-400 shadow-inner"><Info className="h-8 w-8" /></div>
                          <div className="flex-1">
                            <Badge className="mb-2 bg-amber-500/20 text-amber-600 border-none text-[10px] font-black uppercase tracking-[0.2em] px-3 h-6">System Alert</Badge>
                            <p className="text-xl font-black tracking-tight text-foreground/90 leading-tight">{post.content}</p>
                          </div>
                          {isAdmin && <Button variant="ghost" size="icon" className="h-10 w-10 text-destructive hover:bg-destructive/10 rounded-full" onClick={() => deletePost(post.id)}><Trash2 className="h-5 w-5" /></Button>}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <p className="text-lg leading-relaxed whitespace-pre-wrap font-medium text-foreground/80 px-1">{post.content}</p>
                      {post.imageUrl && <div className="rounded-[2rem] overflow-hidden border-2 border-muted/50 shadow-inner bg-muted/20"><img src={post.imageUrl} alt="Post content" className="w-full h-auto object-cover max-h-[600px]" /></div>}
                    </div>
                  )}
                </CardContent>
                {post.type !== 'system' && (
                  <CardFooter className="flex flex-col border-t border-muted/30 pt-6 pb-8 gap-6 px-8">
                    <div className="flex items-center gap-8 w-full">
                      <Button variant="ghost" size="sm" className={cn("h-11 px-6 rounded-full font-black uppercase tracking-widest text-[10px] transition-all", isLiked ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-primary/5 hover:text-primary")} onClick={() => toggleLike(post.id)}>
                        <Heart className={cn("h-4 w-4 mr-2", isLiked && "fill-current")} /> Like {post.likes && post.likes.length > 0 && <span className="ml-2 opacity-60">({post.likes.length})</span>}
                      </Button>
                      <div className="flex items-center gap-2 text-muted-foreground font-black uppercase tracking-widest text-[10px]"><MessageSquare className="h-4 w-4" /> Discussion</div>
                    </div>
                    <div className="w-full space-y-6">
                      <CommentList postId={post.id} teamId={activeTeam.id} isAdmin={isAdmin} currentUserId={user?.id || ''} />
                      <div className="space-y-4 pt-2">
                        {commentImages[post.id] && (
                          <div className="relative inline-block rounded-2xl overflow-hidden border-2 border-primary/20 shadow-lg animate-in zoom-in-95">
                            <img src={commentImages[post.id]} alt="Comment preview" className="h-24 w-auto object-cover" />
                            <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-7 w-7 rounded-full shadow-md" onClick={() => setCommentImages(prev => { const updated = { ...prev }; delete updated[post.id]; return updated; })}><X className="h-4 w-4" /></Button>
                          </div>
                        )}
                        <div className="flex gap-3">
                          <input type="file" ref={el => { commentFileInputRef.current[post.id] = el; }} className="hidden" accept="image/*" onChange={(e) => handleCommentFileChange(post.id, e)} />
                          <Button variant="ghost" size="icon" className="h-12 w-12 rounded-2xl bg-muted/50 text-muted-foreground hover:bg-primary/10 hover:text-primary shrink-0 transition-all" onClick={() => commentFileInputRef.current[post.id]?.click()}><ImagePlus className="h-5 w-5" /></Button>
                          <Input placeholder="Write to your squad..." className="bg-muted/50 border-none rounded-2xl h-12 text-sm font-bold px-6 shadow-inner focus-visible:ring-2 focus-visible:ring-primary/20 transition-all" value={commentInputs[post.id] || ''} onChange={(e) => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && handleCommentSubmit(post.id)} />
                          <Button size="icon" className="rounded-2xl h-12 w-12 shrink-0 shadow-xl shadow-primary/20 active:scale-90 transition-all" onClick={() => handleCommentSubmit(post.id)}><Send className="h-5 w-5" /></Button>
                        </div>
                      </div>
                    </div>
                  </CardFooter>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      <aside className="hidden lg:flex flex-col w-80 shrink-0 space-y-8 animate-in fade-in slide-in-from-right-4 duration-1000">
        <Card className="rounded-[2rem] border-none shadow-xl ring-1 ring-black/5 overflow-hidden">
          <CardHeader className="bg-primary/5 border-b border-primary/5 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Upcoming Schedule</CardTitle>
              <Calendar className="h-4 w-4 text-primary opacity-40" />
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {events.slice(0, 3).length > 0 ? events.slice(0, 3).map((event) => (
              <div key={event.id} className="flex gap-4 group cursor-pointer" onClick={() => router.push('/events')}>
                <div className="h-12 w-12 rounded-2xl bg-muted flex flex-col items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                  <span className="text-[8px] font-black uppercase text-muted-foreground group-hover:text-primary leading-none mb-0.5">{format(event.date, 'MMM')}</span>
                  <span className="text-lg font-black tracking-tighter leading-none">{format(event.date, 'dd')}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black truncate leading-tight group-hover:text-primary transition-colors">{event.title}</p>
                  <p className="text-[10px] font-bold text-muted-foreground mt-1">{event.startTime} • {event.location}</p>
                </div>
              </div>
            )) : <p className="text-xs text-muted-foreground italic text-center py-4">No upcoming events scheduled.</p>}
            <Button variant="ghost" className="w-full text-[10px] font-black uppercase tracking-widest h-10 mt-2 rounded-xl" onClick={() => router.push('/events')}>Full Schedule <ChevronRight className="h-3 w-3 ml-2" /></Button>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-none shadow-xl ring-1 ring-black/5 overflow-hidden bg-primary text-primary-foreground">
          <CardContent className="p-8 space-y-4">
            <Trophy className="h-8 w-8 text-white/40" />
            <h3 className="text-xl font-black tracking-tight leading-tight">Season Progress</h3>
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="bg-white/10 p-3 rounded-2xl border border-white/10 text-center">
                <p className="text-[8px] font-black uppercase text-white/60 tracking-widest mb-1">Wins</p>
                <p className="text-2xl font-black">{games.filter(g => g.result === 'Win').length}</p>
              </div>
              <div className="bg-white/10 p-3 rounded-2xl border border-white/10 text-center">
                <p className="text-[8px] font-black uppercase text-white/60 tracking-widest mb-1">Losses</p>
                <p className="text-2xl font-black">{games.filter(g => g.result === 'Loss').length}</p>
              </div>
            </div>
            <Button variant="secondary" className="w-full h-11 rounded-xl font-black text-[10px] uppercase tracking-widest bg-white text-primary hover:bg-white/90" onClick={() => router.push('/games')}>Scoreboard Dashboard</Button>
          </CardContent>
        </Card>

        <div className="bg-muted/30 p-6 rounded-[2rem] space-y-3 border-2 border-dashed">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h4 className="font-black text-[10px] uppercase tracking-widest text-foreground">Squad Sync</h4>
          </div>
          <p className="text-xs text-muted-foreground font-medium leading-relaxed">Desktop hub active. Coordination is visible to all verified members. Stay high-priority.</p>
        </div>
      </aside>

      <Dialog open={!!viewVotersFor} onOpenChange={() => setViewVotersFor(null)}>
        <DialogContent className="sm:max-w-xs rounded-3xl">
          <DialogHeader><DialogTitle className="text-sm font-black uppercase tracking-widest">Voter List</DialogTitle></DialogHeader>
          <ScrollArea className="max-h-[300px] mt-2">
            <div className="space-y-3 p-1">
              {viewVotersFor?.voterIds.map(vid => {
                const voter = members.find(m => m.userId === vid);
                return (
                  <div key={vid} className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={voter?.avatar} />
                      <AvatarFallback>{voter?.name?.[0] || '?'}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold">{voter?.name || 'Unknown'}</span>
                      <span className="text-[9px] text-muted-foreground font-black uppercase">{voter?.position || 'Member'}</span>
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
