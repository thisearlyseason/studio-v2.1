
"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ImagePlus, MessageSquare, Trash2, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';

const MOCK_POSTS = [
  {
    id: '1',
    author: { name: 'Coach Miller', avatar: 'https://picsum.photos/seed/coach/150/150' },
    content: "Great job today everyone! Let's keep this energy up for the tournament this weekend.",
    type: 'user',
    imageUrl: 'https://picsum.photos/seed/tournament/800/600',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    comments: [
      { id: 'c1', author: 'Alex Smith', content: 'Ready when you are!', createdAt: new Date(Date.now() - 1800000).toISOString() }
    ]
  },
  {
    id: '2',
    author: { name: 'System', avatar: '' },
    content: "New Event: Regional Qualifiers - Saturday at 9:00 AM",
    type: 'system',
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    linkedEventId: 'e1'
  },
  {
    id: '3',
    author: { name: 'Sarah Connor', avatar: 'https://picsum.photos/seed/sarah/150/150' },
    content: "Does anyone have a spare jersey? I lost mine after practice.",
    type: 'user',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    comments: []
  }
];

export default function FeedPage() {
  const [newPost, setNewPost] = useState('');

  return (
    <div className="space-y-6">
      {/* Post Creation */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <Avatar className="h-10 w-10">
              <AvatarImage src="https://picsum.photos/seed/me/150/150" />
              <AvatarFallback>ME</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-3">
              <Textarea 
                placeholder="What's happening with the team?" 
                value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
                className="min-h-[100px] resize-none border-none focus-visible:ring-0 p-0 text-base"
              />
              <div className="flex items-center justify-between pt-2 border-t">
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  <ImagePlus className="h-4 w-4 mr-2" />
                  Photo
                </Button>
                <Button disabled={!newPost.trim()}>Post</Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feed List */}
      <div className="space-y-4">
        {MOCK_POSTS.map((post) => (
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
                    {formatDistanceToNow(new Date(post.createdAt))} ago
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                  <Trash2 className="h-4 w-4" />
                </Button>
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
                    <p className="text-xs text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(post.createdAt))} ago</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>
                  {post.imageUrl && (
                    <div className="rounded-lg overflow-hidden border">
                      <img src={post.imageUrl} alt="Post content" className="w-full h-auto object-cover max-h-[300px]" />
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
                {post.comments.length > 0 && (
                  <div className="w-full space-y-3 pt-2">
                    {post.comments.map((comment) => (
                      <div key={comment.id} className="flex gap-3 text-sm">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback>{comment.author[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 bg-muted/50 p-2 rounded-lg">
                          <span className="font-semibold mr-2">{comment.author}</span>
                          {comment.content}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardFooter>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
