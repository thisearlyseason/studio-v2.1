"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  ImagePlus, 
  MessageSquare, 
  Trash2, 
  Send, 
  Heart, 
  Camera, 
  Loader2, 
  X, 
  MapPin, 
  Trophy, 
  ChevronRight,
  BarChart2,
  Lock,
  Sparkles,
  LayoutDashboard,
  ShieldAlert,
  PenTool,
  Package,
  Terminal,
  Shield,
  Activity,
  ImageIcon,
  Plus,
  MessageCircle,
  LineChart as ChartIcon,
  Calendar as CalendarIcon
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { formatDistanceToNow, format } from 'date-fns';
import { useTeam } from '@/components/providers/team-provider';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useAuth, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
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
import { useToast } from '@/hooks/use-toast';
import { authHeader, getAuthToken } from '@/lib/client-auth';

function CommentList({ postId, teamId, isAdmin, currentUserId, onDeleteComment }: { postId: string, teamId: string, isAdmin: boolean, currentUserId: string, onDeleteComment: (postId: string, commentId: string) => Promise<void> }) {
  const db = useFirestore();
  const q = useMemoFirebase(() => {
    if (!db || !teamId || !postId) return null;
    return query(collection(db, 'teams', teamId, 'feedPosts', postId, 'comments'), orderBy('createdAt', 'asc'), limit(50));
  }, [db, teamId, postId]);
  
  const { data: comments, isLoading } = useCollection(q);

  if (isLoading) return <div className="p-2 text-[10px] text-muted-foreground animate-pulse">Loading comments...</div>;
  if (!comments || comments.length === 0) return null;

  return (
    <div className="space-y-3 mt-4 w-full">
      {comments.map((comment) => (
        <div key={comment.id} className="flex gap-3 items-start animate-in fade-in slide-in-from-left-2 duration-300 group">
          <Avatar className="h-7 w-7 shrink-0 border border-muted">
            <AvatarFallback className="text-[10px] font-bold">{comment.authorName?.[0] || '?'}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 bg-muted/30 p-2.5 rounded-2xl relative">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] font-black tracking-tight truncate max-w-[120px]">{comment.authorName}</span>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-muted-foreground whitespace-nowrap">{formatDistanceToNow(new Date(comment.createdAt))} ago</span>
                {(isAdmin || comment.authorId === currentUserId) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button aria-label={`Delete comment by ${comment.authorName || 'squad member'}`} variant="ghost" size="icon" className="h-5 w-5 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-destructive" onClick={() => void onDeleteComment(postId, comment.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Purge Comment</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
            <p className="text-xs font-medium text-foreground/80 leading-snug break-words">{comment.content}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FeedPage() {
  const { activeTeam, user, updateTeamHero, isSuperAdmin, purchasePro, hasFeature, isStaff, isParent, isPlayer } = useTeam();
  const firebaseAuth = useAuth();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (isParent && activeTeam?.parentFeedEnabled === false) {
      toast({
        title: 'Live Feed Disabled',
        description: 'A squad coach has disabled parent access to the live feed.',
        variant: 'destructive',
      });
      router.replace('/dashboard');
    }
  }, [isParent, activeTeam?.parentFeedEnabled, router]);
  
  const postsQ = useMemoFirebase(() => {
    if (!db || !activeTeam?.id || !user?.id) return null;
    return query(collection(db, 'teams', activeTeam.id, 'feedPosts'), orderBy('createdAt', 'desc'), limit(20));
  }, [db, activeTeam?.id, user?.id]);

  const eventsQ = useMemoFirebase(() => {
    if (!db || !activeTeam?.id || !user?.id) return null;
    return query(collection(db, 'teams', activeTeam.id, 'events'), orderBy('date', 'asc'), limit(3));
  }, [db, activeTeam?.id, user?.id]);

  const gamesQ = useMemoFirebase(() => {
    if (!db || !activeTeam?.id || !user?.id) return null;
    return query(collection(db, 'teams', activeTeam.id, 'games'), orderBy('date', 'desc'), limit(10));
  }, [db, activeTeam?.id, user?.id]);

  const { data: posts } = useCollection(postsQ);
  const { data: events } = useCollection(eventsQ);
  const { data: games } = useCollection(gamesQ);

  const [newPostContent, setNewPostContent] = useState('');
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [commentInputs, setCommentInputs] = useState<{ [key: string]: string }>({});
  const [isUpdatingHero, setIsUpdatingHero] = useState(false);
  const [isPollDialogOpen, setIsPollDialogOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<{text: string, image?: string}[]>([{text: '', image: undefined}, {text: '', image: undefined}]);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);
  const optionImageInputRef = useRef<HTMLInputElement>(null);
  const activeOptionIdxRef = useRef<number | null>(null);

  if (!activeTeam) return null;
  const isAdmin = activeTeam.role === 'Admin' || isSuperAdmin;
  const canReadFeed = hasFeature('live_feed_read');
  const canPost = isStaff || isPlayer || (isParent && activeTeam.parentPostingEnabled); 
  const canComment = isStaff || isPlayer || (isParent && activeTeam.parentCommentsEnabled);

  if (!canReadFeed) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4 space-y-8 animate-in fade-in slide-in-from-bottom-4">
        <div className="relative">
          <div className="bg-primary/10 p-10 rounded-[3rem] shadow-2xl">
            <LayoutDashboard className="h-24 w-24 text-primary" />
          </div>
          {isStaff && (
            <div className="absolute -top-4 -right-4 bg-black text-white p-3 rounded-full shadow-lg border-4 border-background">
              <Lock className="h-6 w-6" />
            </div>
          )}
        </div>
        
        <div className="text-center max-w-md space-y-4">
          <h1 className="text-4xl font-black tracking-tight uppercase">Squad Feed Locked</h1>
          <p className="text-muted-foreground font-bold leading-relaxed text-lg uppercase tracking-wide">
            {isStaff 
              ? <span>The Live Broadcast hub is reserved for <strong>Pro Elite</strong> squads. Upgrade to coordinate updates, polls, and media in real-time.</span>
              : <span>Live broadcasts are only available for <strong>Pro</strong> teams. Contact your team organizer for access.</span>
            }
          </p>
        </div>

        {isStaff && (
          <Card className="w-full max-w-sm border-none shadow-2xl rounded-[3rem] overflow-hidden bg-white ring-1 ring-black/5">
            <div className="p-10 space-y-8">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-primary tracking-[0.2em]">Elite Strategy</span>
                <Badge className="bg-primary text-white border-none font-black text-[10px] px-3 h-6">PRO HUB</Badge>
              </div>
              <ul className="space-y-5">
                <li className="flex items-center gap-4 text-xs font-black uppercase tracking-tight text-foreground/80"><Sparkles className="h-5 w-5 text-primary" /> Real-time Broadcasts</li>
                <li className="flex items-center gap-4 text-xs font-black uppercase tracking-tight text-foreground/80"><Sparkles className="h-5 w-5 text-primary" /> Tactical Image Polls</li>
                <li className="flex items-center gap-4 text-xs font-black uppercase tracking-tight text-foreground/80"><Sparkles className="h-5 w-5 text-primary" /> Historical Content Logs</li>
              </ul>
              <Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 hover:scale-[1.02] transition-transform" onClick={purchasePro}>
                Unlock Live Feed
              </Button>
            </div>
          </Card>
        )}
      </div>
    );
  }

  const runFeedAction = async (payload: Record<string, unknown>) => {
    const token = await getAuthToken(firebaseAuth);
    if (!token) throw new Error('Your session has expired. Please sign in again.');
    const response = await fetch('/api/teams/feed/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({ teamId: activeTeam.id, ...payload }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Unable to update the squad feed.');
    return result;
  };

  const reportFeedError = (error: unknown) => {
    toast({
      title: 'Feed Update Failed',
      description: error instanceof Error ? error.message : 'Unable to update the squad feed.',
      variant: 'destructive',
    });
  };

  const handlePost = async () => {
    if (!newPostContent.trim() && !imageUrl) return;
    try {
      await runFeedAction({ action: 'create-post', content: newPostContent, imageUrl: imageUrl || null });
      setNewPostContent('');
      setImageUrl(undefined);
    } catch (error) {
      reportFeedError(error);
    }
  };

  const handleCreatePoll = async () => {
    const validOptions = pollOptions.filter(o => o.text.trim() !== '');
    if (!pollQuestion.trim() || validOptions.length < 2) {
      toast({
        title: 'Poll Incomplete',
        description: 'Enter a question and at least two options.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await runFeedAction({
        action: 'create-post',
        content: pollQuestion.trim(),
        poll: { options: validOptions.map(o => ({ text: o.text.trim(), imageUrl: o.image || null })) },
      });
      setIsPollDialogOpen(false);
      setPollQuestion('');
      setPollOptions([{text: '', image: undefined}, {text: '', image: undefined}]);
    } catch (error) {
      reportFeedError(error);
    }
  };

  const handleVote = async (postId: string, optionIdx: number) => {
    try {
      await runFeedAction({ action: 'vote', postId, optionIdx });
    } catch (error) {
      reportFeedError(error);
    }
  };

  const handleToggleLike = async (postId: string) => {
    try {
      await runFeedAction({ action: 'toggle-like', postId });
    } catch (error) {
      reportFeedError(error);
    }
  };

  const handleComment = async (postId: string) => {
    const content = commentInputs[postId]?.trim();
    if (!content) return;
    try {
      await runFeedAction({ action: 'create-comment', postId, content });
      setCommentInputs(previous => ({ ...previous, [postId]: '' }));
    } catch (error) {
      reportFeedError(error);
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      await runFeedAction({ action: 'delete-post', postId });
    } catch (error) {
      reportFeedError(error);
    }
  };

  const handleDeleteComment = async (postId: string, commentId: string) => {
    try {
      await runFeedAction({ action: 'delete-comment', postId, commentId });
    } catch (error) {
      reportFeedError(error);
    }
  };

  return (
    <div className="space-y-10 pb-20">
      <div className="space-y-6 lg:space-y-8 max-w-4xl mx-auto w-full">
        {/* Team Hero Section */}
        <section className="relative h-48 sm:h-64 lg:h-80 rounded-3xl lg:rounded-[2.5rem] overflow-hidden shadow-xl lg:shadow-2xl group ring-1 ring-black/5">
          <img src={activeTeam.heroImageUrl || "https://picsum.photos/seed/squadhero/1200/400"} alt="Team Hero" className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          {isAdmin && (
            <div className="absolute top-4 right-4 lg:top-6 lg:right-6 z-20">
              <input type="file" ref={heroInputRef} className="hidden" accept="image/*" onChange={async (e) => {
                if (e.target.files?.[0]) {
                  setIsUpdatingHero(true);
                  const reader = new FileReader();
                  reader.onload = async (ev) => {
                    await updateTeamHero(ev.target?.result as string);
                    setIsUpdatingHero(false);
                  };
                  reader.readAsDataURL(e.target.files[0]);
                }
              }} />
              <Button variant="secondary" size="sm" disabled={isUpdatingHero} className="bg-white/20 backdrop-blur-md text-white hover:bg-white/40 border-none rounded-full h-9 lg:h-10 px-4 lg:px-5 font-bold text-[10px] lg:text-xs" onClick={() => heroInputRef.current?.click()}>
                {isUpdatingHero ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3 lg:h-4 lg:w-4 mr-2" />}
                {isUpdatingHero ? "Updating..." : "Change Cover"}
              </Button>
            </div>
          )}
          <div className="absolute bottom-6 left-6 right-6 lg:bottom-8 lg:left-8 lg:right-8 flex items-end justify-between">
            <div className="space-y-1">
              <Badge className="mb-2 bg-primary/80 text-white border-none font-black uppercase tracking-wider text-[8px] lg:text-[10px] h-5 lg:h-6">Active Squad</Badge>
              <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-tighter leading-none truncate">{activeTeam.name}</h1>
            </div>
          </div>
        </section>

        {/* Post Composition */}
        {canPost && (
          <Card className="rounded-3xl lg:rounded-[3rem] border-none shadow-lg lg:shadow-xl ring-1 ring-black/5 overflow-hidden">
            <CardContent className="p-6 lg:p-8 lg:pb-10">
              <div className="flex flex-col sm:flex-row gap-4 lg:gap-6 items-start">
                <Avatar className="h-10 w-10 lg:h-12 lg:w-12 shrink-0 border-2 border-primary/10">
                  <AvatarImage src={user?.avatar} />
                  <AvatarFallback className="font-black text-xs lg:text-base">{user?.name?.[0] || '?'}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 w-full">
                  <Textarea placeholder={`What's the play, ${user?.name}?`} value={newPostContent} onChange={(e) => setNewPostContent(e.target.value)} className="min-h-[80px] lg:min-h-[100px] w-full resize-none border-none focus-visible:ring-0 p-2 lg:p-4 text-base lg:text-lg font-medium placeholder:text-muted-foreground/30 bg-transparent" />
                  
                  {imageUrl && (
                    <div className="relative mt-2 rounded-2xl overflow-hidden group/img">
                      <img src={imageUrl} className="w-full h-auto max-h-[300px] object-cover border" alt="Upload preview" />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button aria-label="Remove attached image" variant="destructive" size="icon" className="absolute top-2 right-2 h-8 w-8 rounded-full shadow-lg opacity-100 md:opacity-0 md:group-hover/img:opacity-100 focus-visible:opacity-100 transition-opacity" onClick={() => setImageUrl(undefined)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Withdraw Visual Intel</TooltipContent>
                      </Tooltip>
                    </div>
                  )}

                  <div className="flex items-center gap-2 lg:gap-4 pt-4 mt-2 lg:mt-4 border-t">
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => {
                      if (e.target.files?.[0]) {
                        const reader = new FileReader();
                        reader.onload = (ev) => setImageUrl(ev.target?.result as string);
                        reader.readAsDataURL(e.target.files[0]);
                      }
                    }} />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button aria-label="Attach image" variant="ghost" size="icon" className="h-10 w-10 lg:h-12 lg:w-12 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5" onClick={() => fileInputRef.current?.click()}>
                          <ImagePlus className="h-4 w-4 lg:h-5 lg:w-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Attach Tactical Imagery</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button aria-label="Create poll" variant="ghost" size="icon" className="h-10 w-10 lg:h-12 lg:w-12 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5" onClick={() => setIsPollDialogOpen(true)}>
                          <BarChart2 className="h-4 w-4 lg:h-5 lg:w-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Initialize Tactical Poll</TooltipContent>
                    </Tooltip>
                    <Button disabled={!newPostContent.trim() && !imageUrl} onClick={handlePost} className="ml-auto rounded-full px-6 lg:px-8 h-10 lg:h-12 font-black uppercase text-[9px] lg:text-[11px] tracking-widest shadow-lg lg:shadow-xl shadow-primary/20">Post to Squad</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Feed Posts */}
        <div className="space-y-6 lg:space-y-8">
          {posts?.map((post) => (
            <Card key={post.id} className={cn("rounded-3xl lg:rounded-2xl border-none shadow-md overflow-hidden ring-1 ring-black/5 group", post.type === 'system' ? 'bg-muted/30 ring-primary/10' : '')}>
              <CardHeader className="flex flex-row items-center gap-4 lg:gap-5 pb-4 pt-6 lg:pt-8 px-6 lg:px-8">
                <Avatar className="h-10 w-10 lg:h-12 lg:w-12 border-2 border-background shadow-md">
                  <AvatarImage src={post.author?.avatar} />
                  <AvatarFallback className="font-black text-xs lg:text-base">{post.author?.name?.[0] || '?'}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-black text-sm lg:text-base tracking-tight truncate">{post.author?.name}</div>
                  <div className="text-[8px] lg:text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-0.5 lg:mt-1">
                    {formatDistanceToNow(new Date(post.createdAt))} ago
                  </div>
                </div>
                {(isAdmin || post.authorId === user?.id) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button aria-label={`Delete post by ${post.author?.name || 'squad member'}`} variant="ghost" size="icon" className="h-8 w-8 lg:h-10 lg:w-10 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-destructive hover:bg-destructive/10 rounded-full" onClick={() => void handleDeletePost(post.id)}>
                        <Trash2 className="h-4 w-4 lg:h-5 lg:w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Purge Intelligence Report</TooltipContent>
                  </Tooltip>
                )}
              </CardHeader>
              <CardContent className="pt-2 pb-4 lg:pb-6 px-6 lg:px-8 space-y-4">
                {post.type === 'poll' ? (
                  <div className="bg-card border rounded-3xl lg:rounded-[2rem] overflow-hidden">
                    <div className="bg-primary/5 p-4 lg:p-6 border-b flex items-center justify-between">
                      <h4 className="font-black text-base lg:text-xl tracking-tight leading-tight">{post.poll?.question}</h4>
                      <BarChart2 className="h-4 w-4 lg:h-5 lg:w-5 text-primary opacity-50 shrink-0 ml-2" />
                    </div>
                    <div className="p-4 lg:p-6 grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
                      {post.poll?.options.map((opt: any, i: number) => {
                        const hasVoted = post.poll?.voters?.[user?.id || ''] === i;
                        const percentage = post.poll.totalVotes > 0 ? (opt.votes / post.poll.totalVotes) * 100 : 0;
                        return (
                          <div key={i} className="bg-muted/20 rounded-2xl lg:rounded-3xl overflow-hidden p-3 lg:p-4 space-y-2 lg:space-y-3 relative group/opt transition-all hover:bg-muted/30">
                            {opt.imageUrl && <img src={opt.imageUrl} className="aspect-video w-full object-cover rounded-xl cursor-zoom-in" onClick={() => setLightboxImage(opt.imageUrl)} alt={opt.text} />}
                            <button onClick={() => handleVote(post.id, i)} className="w-full text-left">
                              <div className="flex justify-between items-center mb-1.5 lg:mb-2">
                                <span className="font-bold text-xs lg:text-sm flex items-center gap-2 truncate pr-2">{opt.text}{hasVoted && <div className="h-1.5 w-1.5 lg:h-2 lg:w-2 bg-primary rounded-full animate-pulse shrink-0" />}</span>
                                <span className="text-[8px] lg:text-[10px] font-black text-muted-foreground uppercase shrink-0">{opt.votes} v</span>
                              </div>
                              <Progress value={percentage} className="h-2 lg:h-3 rounded-full" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-base lg:text-lg leading-relaxed font-medium text-foreground/80 break-words">{post.content}</p>
                )}
                {post.imageUrl && <img src={post.imageUrl} className="rounded-2xl lg:rounded-2xl w-full h-auto object-cover max-h-[400px] lg:max-h-[600px] border shadow-inner" alt="Feed media" />}
              </CardContent>
              <CardFooter className="flex flex-col border-t border-muted/30 pt-4 lg:pt-6 pb-6 lg:pb-8 gap-4 lg:gap-6 px-6 lg:px-8">
                <div className="flex items-center gap-4 lg:gap-8 w-full">
                  <Button variant="ghost" size="sm" className={cn("h-9 lg:h-11 px-4 lg:px-6 rounded-full font-black uppercase tracking-widest text-[8px] lg:text-[10px]", post.likes?.includes(user?.id) ? "text-primary bg-primary/10" : "text-muted-foreground")} onClick={() => handleToggleLike(post.id)}>
                    <Heart className={cn("h-3.5 w-3.5 lg:h-4 lg:w-4 mr-1.5 lg:mr-2", post.likes?.includes(user?.id) && "fill-current")} /> Like {post.likes?.length > 0 && `(${post.likes.length})`}
                  </Button>
                  <div className="flex items-center gap-1.5 lg:gap-2 text-muted-foreground font-black uppercase tracking-widest text-[8px] lg:text-[10px]"><MessageSquare className="h-3.5 w-3.5 lg:h-4 lg:w-4" /> Discussion</div>
                </div>
                <CommentList postId={post.id} teamId={activeTeam.id} isAdmin={isAdmin} currentUserId={user?.id || ''} onDeleteComment={handleDeleteComment} />
                <div className="flex gap-2 lg:gap-3 w-full">
                  <Input 
                    placeholder={canComment ? "Write to squad..." : "Comments restricted"} 
                    disabled={!canComment}
                    className="bg-muted/50 border-none rounded-xl lg:rounded-2xl h-10 lg:h-12 text-xs lg:text-sm font-bold px-4 lg:px-6 shadow-inner" 
                    value={commentInputs[post.id] || ''} 
                    onChange={(e) => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))} 
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && commentInputs[post.id]?.trim()) {
                        e.preventDefault();
                        void handleComment(post.id);
                      }
                    }}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        size="icon" 
                        aria-label="Post comment"
                        disabled={!canComment}
                        className="rounded-xl lg:rounded-2xl h-10 w-10 lg:h-12 lg:w-12 shrink-0 shadow-lg lg:shadow-xl shadow-primary/20" 
                        onClick={() => void handleComment(post.id)}
                      >
                        <Send className="h-4 w-4 lg:h-5 lg:w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="bg-black text-white border-white/10 font-bold text-[10px] uppercase tracking-widest">Transmit Mark</TooltipContent>
                  </Tooltip>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={isPollDialogOpen} onOpenChange={setIsPollDialogOpen}>
        <DialogContent className="sm:max-w-4xl rounded-3xl lg:rounded-[2rem] overflow-hidden p-0 max-h-[90vh] flex flex-col border-none shadow-2xl">
          <DialogTitle className="sr-only">Launch Squad Poll</DialogTitle>
          <DialogDescription className="sr-only">Create a tactical poll for your squad</DialogDescription>
          <div className="overflow-y-auto flex-1 custom-scrollbar">
            <div className="grid grid-cols-1 lg:grid-cols-2 h-full">
              <div className="p-6 lg:p-8 bg-primary/5 lg:border-r space-y-4 lg:space-y-6">
                <DialogHeader>
                  <DialogTitle className="text-xl lg:text-2xl font-black tracking-tight">Launch Squad Poll</DialogTitle>
                  <DialogDescription className="font-bold text-primary/60 uppercase tracking-widest text-[8px] lg:text-[10px]">Collect squad consensus</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-2 lg:pt-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">The Question</Label>
                    <Input placeholder="e.g. Best time for training?" value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} className="rounded-xl h-11 lg:h-12 bg-background font-bold" />
                  </div>
                </div>
              </div>
              <div className="p-6 lg:p-8 space-y-4 lg:space-y-6 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Polling Options</Label>
                    <Button variant="ghost" size="sm" onClick={() => setPollOptions([...pollOptions, {text: '', image: undefined}])} disabled={pollOptions.length >= 6} className="h-7 text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-primary">
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  </div>
                  <div className="space-y-2 lg:space-y-3">
                    {pollOptions.map((opt, i) => (
                      <div key={i} className="flex gap-2 lg:gap-3 animate-in fade-in slide-in-from-left-2">
                        <Input placeholder={`Option ${i+1}`} value={opt.text} onChange={e => { const n = [...pollOptions]; n[i].text = e.target.value; setPollOptions(n); }} className="rounded-xl h-10 lg:h-11 bg-muted/30 focus:bg-background" />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button aria-label={`Attach image to option ${i + 1}`} variant="ghost" size="icon" className="h-10 w-10 lg:h-11 lg:w-11 rounded-xl bg-muted/20" onClick={() => { activeOptionIdxRef.current = i; optionImageInputRef.current?.click(); }}>
                              <ImageIcon className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="bg-black text-white border-white/10 font-bold text-[10px] uppercase tracking-widest">Enroll Reference Graphic</TooltipContent>
                        </Tooltip>
                      </div>
                    ))}
                  </div>
                </div>
                <Button className="w-full h-12 lg:h-14 rounded-2xl text-base lg:text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all mt-4 lg:mt-0" onClick={handleCreatePoll}>Launch Poll</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <input type="file" ref={optionImageInputRef} className="hidden" accept="image/*" onChange={(e) => {
        if (e.target.files?.[0] && activeOptionIdxRef.current !== null) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const n = [...pollOptions];
            n[activeOptionIdxRef.current!].image = ev.target?.result as string;
            setPollOptions(n);
          };
          reader.readAsDataURL(e.target.files[0]);
        }
      }} />

      <Dialog open={!!lightboxImage} onOpenChange={() => setLightboxImage(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl p-0 overflow-hidden bg-black/95 border-none rounded-2xl lg:rounded-2xl">
          <DialogTitle className="sr-only">Image Preview</DialogTitle>
          <DialogDescription className="sr-only">Enlarged view of shared media</DialogDescription>
          {lightboxImage && <img src={lightboxImage} className="w-full h-auto max-h-[85vh] object-contain" alt="Enlarged view" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
