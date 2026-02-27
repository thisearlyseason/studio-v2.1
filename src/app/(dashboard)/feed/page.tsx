
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ImagePlus, MessageSquare, Trash2, Calendar, Send, Heart, Camera, Loader2, Info, X, MapPin, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatDistanceToNow, format } from 'date-fns';
import { useTeam, Comment } from '@/components/providers/team-provider';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';

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
  const { activeTeam, posts, addPost, deletePost, addComment, toggleLike, user, updateTeamHero, formatTime } = useTeam();
  const [newPostContent, setNewPostContent] = useState('');
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [commentInputs, setCommentInputs] = useState<{ [key: string]: string }>({});
  const [commentImages, setCommentImages] = useState<{ [key: string]: string }>({});
  const [mounted, setMounted] = useState(false);
  const [isUpdatingHero, setIsUpdatingHero] = useState(false);
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

  const isAdmin = activeTeam.role === 'Admin';

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

  const handleCommentFileChange = async (postId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const compressed = await compressImage(e.target.files[0]);
      setCommentImages(prev => ({ ...prev, [postId]: compressed }));
    }
  };

  const handleHeroChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
  };

  const handleCommentSubmit = (postId: string) => {
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
  };

  const handleToggleLike = (postId: string) => {
    toggleLike(postId);
  };

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      <section className="relative h-48 sm:h-64 rounded-3xl overflow-hidden shadow-2xl group ring-1 ring-black/5">
        <img 
          src={activeTeam.heroImageUrl || "https://picsum.photos/seed/squadhero/1200/400"} 
          alt="Team Hero" 
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        
        {isAdmin && (
          <div className="absolute top-4 right-4 z-20">
            <input type="file" ref={heroInputRef} className="hidden" accept="image/*" onChange={handleHeroChange} />
            <Button 
              variant="secondary" 
              size="sm" 
              disabled={isUpdatingHero}
              className="bg-white/20 backdrop-blur-md text-white hover:bg-white/40 border-none rounded-full h-9 transition-all active:scale-95 shadow-lg px-4"
              onClick={() => heroInputRef.current?.click()}
            >
              {isUpdatingHero ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Camera className="h-4 w-4 mr-2" />
              )}
              {isUpdatingHero ? "Uploading..." : "Change Cover"}
            </Button>
          </div>
        )}

        <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between">
          <div className="space-y-1">
            <Badge variant="secondary" className="mb-2 bg-white/20 backdrop-blur-md text-white border-none font-bold uppercase tracking-wider text-[10px]">
              Active Squad
            </Badge>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight drop-shadow-lg">
              {activeTeam.name}
            </h1>
            <p className="text-white/70 text-sm font-medium">Join the discussion, coordinate the win.</p>
          </div>
        </div>
      </section>

      <Card className="rounded-3xl border-none shadow-xl shadow-primary/5 overflow-hidden ring-1 ring-black/5">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <Avatar className="h-12 w-12 shrink-0 border-2 border-primary/10">
              <AvatarImage src={user?.avatar} />
              <AvatarFallback className="font-bold">{user?.name?.[0] || '?'}</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-4 min-w-0">
              <Textarea 
                placeholder={`What's the play for ${activeTeam.name}?`} 
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
                className="min-h-[100px] resize-none border-none focus-visible:ring-0 p-0 text-lg font-medium placeholder:text-muted-foreground/50"
              />
              {imageUrl && (
                <div className="relative rounded-2xl overflow-hidden border-4 border-white shadow-lg animate-in zoom-in-95">
                  <img src={imageUrl} alt="Preview" className="w-full h-auto object-cover max-h-[400px]" />
                  <Button variant="destructive" size="icon" className="absolute top-3 right-3 h-8 w-8 rounded-full shadow-lg" onClick={() => setImageUrl(undefined)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <div className="flex items-center justify-between pt-4 border-t border-muted/50">
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground font-bold hover:bg-primary/5" onClick={() => fileInputRef.current?.click()}>
                    <ImagePlus className="h-4 w-4 mr-2" />
                    Media
                  </Button>
                </div>
                <Button disabled={!newPostContent.trim() && !imageUrl} onClick={handlePost} className="rounded-full px-6 font-bold shadow-lg shadow-primary/20 transition-all active:scale-95">
                  Post to Squad
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {posts.map((post) => {
          const isLiked = post.likes?.includes(user?.id || '');
          const canDelete = isAdmin || (post.authorId === user?.id);

          return (
            <Card key={post.id} className={cn(
              "rounded-3xl border-none shadow-md overflow-hidden transition-all duration-300 hover:shadow-xl ring-1 ring-black/5 group",
              post.type === 'system' ? 'bg-amber-50 dark:bg-amber-950/20 ring-amber-500/10' : ''
            )}>
              {post.type === 'user' && (
                <CardHeader className="flex flex-row items-center gap-4 pb-3">
                  <Avatar className="h-11 w-11 border-2 border-background shadow-sm">
                    <AvatarImage src={post.author.avatar} />
                    <AvatarFallback className="font-bold">{post.author.name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-sm tracking-tight">{post.author.name}</div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                      {post.createdAt ? formatDistanceToNow(new Date(post.createdAt)) + ' ago' : 'Live'} • {formatTime(post.createdAt)}
                    </div>
                  </div>
                  {canDelete && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                      onClick={() => deletePost(post.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </CardHeader>
              )}
              <CardContent className={post.type === 'system' ? 'p-0' : 'pt-2 pb-4'}>
                {post.type === 'system' ? (
                  <div className="p-4 sm:p-6">
                    {post.systemData ? (
                      <div className="bg-white dark:bg-background rounded-2xl border-2 border-amber-500/20 shadow-sm overflow-hidden animate-in zoom-in-95">
                        <div className="bg-amber-100 dark:bg-amber-900/40 py-2 px-4 flex justify-center">
                          <span className="text-[10px] font-black uppercase text-amber-700 dark:text-amber-400 tracking-[0.2em]">{post.systemData.updateType}</span>
                        </div>
                        <div className="p-6 flex flex-col sm:flex-row items-center gap-6">
                          <div className="flex flex-col items-center justify-center border-r-0 sm:border-r pr-0 sm:pr-8 min-w-[100px] text-center">
                            <span className="text-sm font-bold text-foreground/60 uppercase">{format(new Date(post.systemData.date), 'EEE')}</span>
                            <span className="text-2xl font-black text-foreground">{format(new Date(post.systemData.date), 'MM/dd')}</span>
                            <span className="text-[9px] font-black uppercase text-muted-foreground mt-2 tracking-widest">{post.systemData.label || 'GAME UPDATE'}</span>
                          </div>
                          <div className="flex-1 space-y-3 text-center sm:text-left">
                            <h3 className="text-xl font-black text-foreground tracking-tight">{post.systemData.title}</h3>
                            {post.systemData.detail && (
                              <p className="text-sm font-bold text-amber-600 dark:text-amber-400/80 bg-amber-500/5 py-1 px-3 rounded-lg inline-block">{post.systemData.detail}</p>
                            )}
                            <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start text-sm font-bold text-muted-foreground">
                              <div className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> {post.systemData.startTime}{post.systemData.endTime ? ` - ${post.systemData.endTime}` : ''}</div>
                              <div className="flex items-center gap-1.5 truncate max-w-xs"><MapPin className="h-4 w-4" /> {post.systemData.location}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4">
                        <div className="bg-amber-100 dark:bg-amber-900/40 p-3 rounded-2xl text-amber-600 dark:text-amber-400">
                          <Info className="h-6 w-6" />
                        </div>
                        <div className="flex-1">
                          <Badge className="mb-2 bg-amber-500/20 text-amber-600 border-none text-[9px] font-black uppercase tracking-widest">System Update</Badge>
                          <p className="text-base font-bold tracking-tight text-foreground/90 leading-tight">{post.content}</p>
                        </div>
                        {isAdmin && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive"
                            onClick={() => deletePost(post.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-base leading-relaxed whitespace-pre-wrap font-medium text-foreground/80 px-1">{post.content}</p>
                    {post.imageUrl && (
                      <div className="rounded-2xl overflow-hidden border-2 border-muted/50 shadow-sm bg-muted/30">
                        <img src={post.imageUrl} alt="Post content" className="w-full h-auto object-cover max-h-[500px]" />
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
              {post.type === 'user' && (
                <CardFooter className="flex flex-col border-t border-muted/30 pt-4 pb-6 gap-4">
                  <div className="flex items-center gap-6 w-full px-1">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className={cn(
                        "h-9 px-4 rounded-full font-bold transition-all",
                        isLiked ? "text-primary bg-primary/5" : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
                      )}
                      onClick={() => handleToggleLike(post.id)}
                    >
                      <Heart className={cn("h-4 w-4 mr-2", isLiked && "fill-current")} />
                      Like
                      {post.likes && post.likes.length > 0 && (
                        <span className="ml-1.5 opacity-60">({post.likes.length})</span>
                      )}
                    </Button>
                    <div className="flex items-center gap-2 text-muted-foreground font-bold text-sm">
                      <MessageSquare className="h-4 w-4" />
                      Discussion
                    </div>
                  </div>
                  <div className="w-full space-y-4 px-1">
                    <CommentList postId={post.id} teamId={activeTeam.id} isAdmin={isAdmin} currentUserId={user?.id || ''} />
                    
                    <div className="space-y-3 pt-2">
                      {commentImages[post.id] && (
                        <div className="relative inline-block rounded-xl overflow-hidden border-2 border-primary/20 shadow-sm animate-in zoom-in-95">
                          <img src={commentImages[post.id]} alt="Comment preview" className="h-20 w-auto object-cover" />
                          <Button 
                            variant="destructive" 
                            size="icon" 
                            className="absolute -top-1 -right-1 h-5 w-5 rounded-full"
                            onClick={() => setCommentImages(prev => {
                              const updated = { ...prev };
                              delete updated[post.id];
                              return updated;
                            })}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input 
                          type="file" 
                          ref={el => { commentFileInputRef.current[post.id] = el; }} 
                          className="hidden" 
                          accept="image/*" 
                          onChange={(e) => handleCommentFileChange(post.id, e)} 
                        />
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-11 w-11 rounded-2xl bg-muted/50 text-muted-foreground"
                          onClick={() => commentFileInputRef.current[post.id]?.click()}
                        >
                          <ImagePlus className="h-5 w-5" />
                        </Button>
                        <Input 
                          placeholder="Write something to your squad..." 
                          className="bg-muted/50 border-none rounded-2xl h-11 text-sm font-medium px-5 shadow-inner"
                          value={commentInputs[post.id] || ''}
                          onChange={(e) => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === 'Enter' && handleCommentSubmit(post.id)}
                        />
                        <Button size="icon" className="rounded-2xl h-11 w-11 shrink-0 shadow-lg shadow-primary/10 active:scale-90" onClick={() => handleCommentSubmit(post.id)}>
                          <Send className="h-5 w-5" />
                        </Button>
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
  );
}
