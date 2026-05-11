'use client';

import React, { useState, useEffect } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Bug, X, Send, Camera, MessageSquare, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';

export default function BugReporter() {
  const { user, isAuthResolved } = useUser();
  const db = useFirestore();
  const [isBetaTester, setIsBetaTester] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [bugText, setBugText] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isAuthResolved || !user || !db) return;

    const checkBetaStatus = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists() && userDoc.data().isBetaTester) {
          setIsBetaTester(true);
        }
      } catch (err) {
        console.error("Error checking beta tester status:", err);
      }
    };

    checkBetaStatus();
  }, [user, isAuthResolved, db]);

  if (!isBetaTester) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bugText.trim()) return;
    setIsSubmitting(true);

    try {
      await addDoc(collection(db, 'bug_reports'), {
        userId: user!.uid,
        userEmail: user!.email,
        description: bugText,
        screenshotUrl,
        url: window.location.href,
        userAgent: navigator.userAgent,
        createdAt: serverTimestamp(),
        status: 'open'
      });
      
      toast({ title: 'Bug Reported', description: 'Thank you for your feedback!' });
      setIsOpen(false);
      setBugText('');
      setScreenshotUrl('');
    } catch (err: any) {
      toast({ title: 'Submission Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 z-[9999] bg-primary text-white p-4 rounded-full shadow-2xl hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all group border-2 border-primary/20"
          >
            <Bug className="w-6 h-6 group-hover:rotate-12 transition-transform" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-[9999] w-[350px] bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="bg-primary/10 border-b border-gray-100 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bug className="w-4 h-4 text-primary" />
                <span className="font-black uppercase tracking-widest text-xs text-gray-900">Report Bug</span>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-900 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Issue Description</Label>
                <Textarea 
                  autoFocus
                  required
                  value={bugText}
                  onChange={e => setBugText(e.target.value)}
                  placeholder="What's broken? Please be specific..."
                  className="bg-gray-50 border-gray-200 text-sm min-h-[100px] resize-none focus-visible:ring-primary text-gray-900"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Screenshot Link (Optional)</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Camera className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="url"
                      value={screenshotUrl}
                      onChange={e => setScreenshotUrl(e.target.value)}
                      placeholder="Paste image URL here..."
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg h-9 pl-9 pr-3 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-gray-400"
                    />
                  </div>
                </div>
              </div>

              <Button 
                type="submit" 
                disabled={isSubmitting || !bugText.trim()} 
                className="w-full font-black uppercase text-[10px] tracking-widest h-10 shadow-lg"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-3 h-3 mr-2" /> Submit Report</>}
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
