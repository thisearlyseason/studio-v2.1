
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ImagePlus, MessageSquare, Trash2, Calendar, Send, Heart, Share2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatDistanceToNow } from 'date-fns';
import { useTeam } from '@/components/providers/team-provider';
import { cn } from '@/lib/utils';

export default function FeedPage() {
  const { activeTeam, posts, addPost, addComment, user } = useTeam();
  const [newPostContent, setNewPostContent] = useState('');
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [commentInputs, setCommentInputs] = useState<{ [key: string]: string }>({});
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handlePost = () => {
    if (!newPostContent.trim()) return;
    addPost(newPostContent, imageUrl);
    setNewPostContent('');
    setImageUrl(undefined);
  };

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCommentSubmit = (postId: string) => {
    const content = commentInputs[postId];
    if (!content?.trim()) return;
    addComment(postId, content);
    setCommentInputs(prev => ({ ...prev, [postId]: '' }));
  };

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      {/* Dynamic Team Hero */}
      <section className="relative h-48 sm:h-64 rounded-3xl overflow-hidden shadow-2xl group">
        <img 
          src="https://picsum.photos/seed/squadhero/1200/400" 
          alt="Team Hero" 
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
          data-ai-hint="sports team"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
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

      {/* Post Creator */}
      <Card className="rounded-3xl border-none shadow-xl shadow-primary/5 overflow-hidden ring-1 ring-black/5">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <Avatar className="h-12 w-12 shrink-0 border-2 border-primary/10">
              <AvatarImage src={user?.avatar} />
              <AvatarFallback className="font-bold">{user?.name?.[0] || '?'}</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-4 min-w-0">
              <Textarea 
                placeholder="What's the play for today?" 
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
                className="min-h-[100px] resize-none border-none focus-visible:ring-0 p-0 text-lg font-medium placeholder:text-muted-foreground/50"
              />
              
              {imageUrl && (
                <div className="relative rounded-2xl overflow-hidden border-4 border-white shadow-lg animate-in zoom-in-95 duration-300">
                  <img src={imageUrl} alt="Preview" className="w-full h-auto object-cover max-h-[400px]" />
                  <Button 
                    variant="destructive" 
                    size="icon" 
                    className="absolute top-3 right-3 h-8 w-8 rounded-full shadow-2xl"
                    onClick={() => setImageUrl(undefined)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-muted/50">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  onChange={handleFileChange} 
                />
                <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground font-bold hover:bg-primary/5 hover:text-primary" onClick={handleImageClick}>
                  <ImagePlus className="h-4 w-4 mr-2" />
                  Media
                </Button>
                <Button 
                  disabled={!newPostContent.trim()} 
                  onClick={handlePost}
                  className="rounded-full px-6 font-bold shadow-lg shadow-primary/20 active:scale-95 transition-all"
                >
                  Post to Squad
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feed Stream */}
      <div className="space-y-6">
        {posts.length > 0 ? (
          posts.map((post) => (
            <Card key={post.id} className={cn(
              "rounded-3xl border-none shadow-md overflow-hidden transition-all duration-300 hover:shadow-xl ring-1 ring-black/5",
              post.type === 'system' ? 'bg-primary/5 ring-primary/10' : ''
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
                      {mounted ? (post.createdAt ? formatDistanceToNow(new Date(post.createdAt)) + ' ago' : 'Live') : '...'}
                    </div>
                  </div>
                </CardHeader>
              )}

              <CardContent className={cn(post.type === 'system' ? 'py-5' : 'pt-2 pb-4')}>
                {post.type === 'system' ? (
                  <div className="flex items-center gap-4">
                    <div className="bg-primary/20 p-3 rounded-2xl text-primary shadow-inner">
                      <Calendar className="h-6 w-6" />
                    </div>
                    <div>
                      <Badge className="mb-2 bg-primary/20 text-primary border-none text-[9px] font-black uppercase tracking-widest">Team Insight</Badge>
                      <p className="text-base font-bold tracking-tight text-primary/90">{post.content}</p>
                    </div>
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
                    <Button variant="ghost" size="sm" className="h-9 px-4 rounded-full text-muted-foreground font-bold hover:bg-primary/5 hover:text-primary group">
                      <Heart className="h-4 w-4 mr-2 group-hover:fill-current" />
                      Approve
                    </Button>
                    <Button variant="ghost" size="sm" className="h-9 px-4 rounded-full text-muted-foreground font-bold hover:bg-primary/5 hover:text-primary">
                      <MessageSquare className="h-4 w-4 mr-2" />
                      {(post.comments || []).length} Comments
                    </Button>
                  </div>
                  
                  <div className="w-full space-y-4 px-1">
                    {(post.comments || []).map((comment) => (
                      <div key={comment.id} className="flex gap-3 group">
                        <Avatar className="h-9 w-9 shrink-0 shadow-sm border-2 border-background">
                          <AvatarFallback className="font-bold text-xs">{comment.author[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 bg-muted/40 p-3 rounded-2xl relative transition-colors group-hover:bg-muted/60">
                          <div className="font-extrabold text-xs mb-1">{comment.author}</div>
                          <div className="text-sm font-medium text-foreground/70">{comment.content}</div>
                          <div className="text-[9px] font-bold text-muted-foreground/50 mt-1.5 uppercase tracking-widest">
                            {mounted ? (comment.createdAt ? formatDistanceToNow(new Date(comment.createdAt)) + ' ago' : 'Now') : '...'}
                          </div>
                        </div>
                      </div>
                    ))}

                    <div className="flex gap-3 pt-2">
                      <Input 
                        placeholder="Write something to your squad..." 
                        className="bg-muted/50 border-none rounded-2xl h-11 text-sm font-medium px-5 focus-visible:ring-primary/20"
                        value={commentInputs[post.id] || ''}
                        onChange={(e) => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && handleCommentSubmit(post.id)}
                      />
                      <Button size="icon" className="rounded-2xl h-11 w-11 shrink-0 shadow-lg shadow-primary/10 active:scale-90 transition-all" onClick={() => handleCommentSubmit(post.id)}>
                        <Send className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                </CardFooter>
              )}
            </Card>
          ))
        ) : (
          <div className="text-center py-24 bg-muted/20 border-2 border-dashed border-muted rounded-[2.5rem] animate-in fade-in zoom-in duration-500">
            <div className="w-20 h-20 bg-muted/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <MessageSquare className="h-10 w-10 text-muted-foreground/30" />
            </div>
            <h3 className="font-black text-2xl tracking-tight mb-2">The field is clear.</h3>
            <p className="text-muted-foreground font-medium max-w-xs mx-auto">Be the first to post a play or a highlight for {activeTeam.name}!</p>
          </div>
        )}
      </div>
    </div>
  );
}
