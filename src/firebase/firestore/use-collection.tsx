
'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Query,
  onSnapshot,
  DocumentData,
  FirestoreError,
  QuerySnapshot,
  CollectionReference,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export type WithId<T> = T & { id: string };

export interface UseCollectionResult<T> {
  data: WithId<T>[] | null;
  isLoading: boolean;
  error: FirestoreError | Error | null;
}

/**
 * React hook to subscribe to a Firestore collection or query in real-time.
 * Hardened with strictly defensive path guards and unmount protection.
 */
export function useCollection<T = any>(
    memoizedTargetRefOrQuery: ((CollectionReference<DocumentData> | Query<DocumentData>) & {__memo?: boolean})  | null | undefined,
): UseCollectionResult<T> {
  type ResultItemType = WithId<T>;
  const [data, setData] = useState<ResultItemType[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<FirestoreError | Error | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    
    if (!memoizedTargetRefOrQuery) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Defensive path check to prevent root-level listing attempts
    let path = '';
    let isCollectionGroup = false;
    try {
      const q = memoizedTargetRefOrQuery as any;
      if (q.type === 'collection') {
        path = q.path;
      } else {
        // Safe query path detection
        path = q._query?.path?.canonicalString() || '';
        if (!path && q._query?.collectionGroup) {
          path = q._query.collectionGroup;
          isCollectionGroup = true;
        }
        if (!path) path = 'query';
      }
    } catch (e) {
      path = 'query';
    }

    const trimmedPath = (path || '').trim();
    
    // CRITICAL GUARD: Explicitly block root paths or uninitialized segments
    if (
      !trimmedPath || 
      trimmedPath === '/' || 
      trimmedPath === '//' || 
      trimmedPath.includes('//') || 
      trimmedPath.includes('/undefined') ||
      trimmedPath.includes('undefined/') ||
      (trimmedPath === 'query' && !isCollectionGroup) || 
      (trimmedPath === 'collection' && !isCollectionGroup)
    ) {
      if (!isCollectionGroup) {
        setData(null);
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = onSnapshot(
      memoizedTargetRefOrQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        if (!isMounted.current) return;
        const results: ResultItemType[] = [];
        snapshot.forEach((doc) => {
          results.push({ ...(doc.data() as T), id: doc.id });
        });
        setData(results);
        setError(null);
        setIsLoading(false);
      },
      (err: FirestoreError) => {
        if (!isMounted.current) return;
        
        // Suppress index errors (failed-precondition) or auth-transient errors
        if (err.code === 'failed-precondition' || trimmedPath.includes('demo_guest') || trimmedPath === 'query') {
          setIsLoading(false);
          return;
        }

        const contextualError = new FirestorePermissionError({
          operation: 'list',
          path: trimmedPath || 'collection',
        });

        setError(contextualError);
        setData(null);
        setIsLoading(false);
        errorEmitter.emit('permission-error', contextualError);
      }
    );

    return () => {
      isMounted.current = false;
      unsubscribe();
    };
  }, [memoizedTargetRefOrQuery]);

  return { data, isLoading, error };
}
