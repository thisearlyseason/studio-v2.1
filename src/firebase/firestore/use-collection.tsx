
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
 * Hardened with strictly defensive path guards to prevent internal assertion errors.
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

    // Defensive path check to prevent root-level listing attempts or malformed queries
    let path = '';
    try {
      const q = memoizedTargetRefOrQuery as any;
      path = q.path || q._query?.path?.canonicalString() || '';
    } catch (e) {
      path = 'query';
    }

    // CRITICAL GUARD: Do not establish listeners on uninitialized, root, or malformed paths
    // This prevents the FIRESTORE INTERNAL ASSERTION FAILED error during state transitions.
    if (!path || path === '/' || path === '' || path.includes('undefined') || path.includes('//')) {
      setData(null);
      setIsLoading(false);
      return;
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
        
        // Suppress transient errors during rapid state transitions or lack of auth
        if (err.code === 'permission-denied' && !path.startsWith('teams/')) {
           // Allow silent failure for public collections like 'plans' when auth is resolving
           setIsLoading(false);
           return;
        }

        if (err.code === 'failed-precondition' || path.includes('undefined')) {
          setIsLoading(false);
          return;
        }

        const contextualError = new FirestorePermissionError({
          operation: 'list',
          path: path || 'collection',
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
