
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ImagePlus, MessageSquare, Trash2, Calendar, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatDistanceToNow } from 'date-fns';
import { useTeam } from '@/components/providers/team-provider';

export default function FeedPage() {
  const { activeTeam, posts, addPost, addComment } = useTeam();
  const [newPostContent, setNewPostContent] = useState('');
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [commentInputs, setCommentInputs] = useState<{ [key: string]: string }>({});
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const teamPosts = posts.filter(p => p.teamId === activeTeam.id);

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
      // Simulate image upload
      setImageUrl(`https://picsum.photos/seed/${Date.now()}/800/600`);
    }
  };

  const handleCommentSubmit = (postId: string) => {
    const content = commentInputs[postId];
    if (!content?.trim()) return;
    addComment(postId, content);
    setCommentInputs(prev => ({ ...prev, [postId]: '' }));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarImage src="https://picsum.photos/seed/me/150/150" />
              <AvatarFallback>ME</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-3 min-w-0">
              <Textarea 
                placeholder={`Post to ${activeTeam.name}...`} 
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
                className="min-h-[100px] resize-none border-none focus-visible:ring-0 p-0 text-base"
              />
              
              {imageUrl && (
                <div className="relative rounded-lg overflow-hidden border max-h-[200px]">
                  <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                  <Button 
                    variant="destructive" 
                    size="icon" 
                    className="absolute top-2 right-2 h-6 w-6 rounded-full"
                    onClick={() => setImageUrl(undefined)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  onChange={handleFileChange} 
                />
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={handleImageClick}>
                  <ImagePlus className="h-4 w-4 mr-2" />
                  Photo
                </Button>
                <Button disabled={!newPostContent.trim()} onClick={handlePost}>Post</Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {teamPosts.length > 0 ? teamPosts.map((post) => (
          <Card key={post.id} className={post.type === 'system' ? 'border-primary/20 bg-primary/5' : ''}>
            {post.type === 'user' && (
              <CardHeader className="flex flex-row items-center gap-3 pb-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={post.author.avatar} />
                  <AvatarFallback>{post.author.name[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="font-semibold text-sm">{post.author.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {mounted ? `${formatDistanceToNow(new Date(post.createdAt))} ago` : '...'}
                  </div>
                </div>
              </CardHeader>
            )}

            <CardContent className={post.type === 'system' ? 'py-4' : 'pt-0'}>
              {post.type === 'system' ? (
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-full">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <Badge variant="outline" className="mb-1 text-[10px] uppercase tracking-wider">System update</Badge>
                    <p className="text-sm font-medium">{post.content}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {mounted ? `${formatDistanceToNow(new Date(post.createdAt))} ago` : '...'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pt-4">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>
                  {post.imageUrl && (
                    <div className="rounded-lg overflow-hidden border">
                      <img src={post.imageUrl} alt="Post content" className="w-full h-auto object-cover max-h-[400px]" />
                    </div>
                  )}
                </div>
              )}
            </CardContent>

            {post.type === 'user' && (
              <CardFooter className="flex flex-col border-t pt-3 gap-3">
                <div className="flex items-center gap-4 w-full">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    {post.comments.length} Comments
                  </Button>
                </div>
                
                <div className="w-full space-y-4 pt-2">
                  {post.comments.map((comment) => (
                    <div key={comment.id} className="flex gap-3 text-sm">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback>{comment.author[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 bg-muted/50 p-3 rounded-2xl relative">
                        <div className="font-bold text-xs mb-1">{comment.author}</div>
                        <div className="text-sm">{comment.content}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {mounted ? formatDistanceToNow(new Date(comment.createdAt)) + ' ago' : '...'}
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="flex gap-2 pt-2">
                    <Input 
                      placeholder="Write a comment..." 
                      className="bg-muted border-none rounded-full h-9 text-sm"
                      value={commentInputs[post.id] || ''}
                      onChange={(e) => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && handleCommentSubmit(post.id)}
                    />
                    <Button size="icon" className="rounded-full h-9 w-9 shrink-0" onClick={() => handleCommentSubmit(post.id)}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardFooter>
            )}
          </Card>
        )) : (
          <div className="text-center py-20 bg-muted/20 rounded-2xl border-2 border-dashed">
            <p className="text-muted-foreground">No posts for {activeTeam.name} yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
