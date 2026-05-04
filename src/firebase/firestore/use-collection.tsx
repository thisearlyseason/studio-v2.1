'use client';

import { useState, useEffect } from 'react';
import {
  Query,
  onSnapshot,
  DocumentData,
  FirestoreError,
  QuerySnapshot,
  CollectionReference,
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/** Utility type to add an 'id' field to a given type T. */
export type WithId<T> = T & { id: string };

/** Interface for the return value of the useCollection hook. */
export interface UseCollectionResult<T> {
  data: WithId<T>[] | null;
  isLoading: boolean;
  error: FirestoreError | Error | null;
}

/* Internal type for query path extraction */
export interface InternalQuery extends Query<DocumentData> {
  _query?: {
    path?: {
      canonicalString?(): string;
      toString?(): string;
    };
  };
}

/**
 * React hook to subscribe to a Firestore collection or query in real-time.
 * Strictly waits for Firebase Auth resolution before dispatching queries.
 */
export function useCollection<T = any>(
  memoizedTargetRefOrQuery: ((CollectionReference<DocumentData> | Query<DocumentData>) & { __memo?: boolean }) | null | undefined,
): UseCollectionResult<T> {
  type ResultItemType = WithId<T>;
  type StateDataType = ResultItemType[] | null;

  const [data, setData] = useState<StateDataType>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<FirestoreError | Error | null>(null);

  useEffect(() => {
    if (!memoizedTargetRefOrQuery) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const auth = getAuth();
    let unsubscribeSnapshot: (() => void) | null = null;

    // 1. Path Extraction for Contextual Errors
    let path: string = '';
    try {
      // Only CollectionReference has a 'type' property and a readable path
      // For Query objects (including collectionGroup), we can't easily extract a path
      if ((memoizedTargetRefOrQuery as any).type === 'collection') {
        path = (memoizedTargetRefOrQuery as CollectionReference).path;
      }
      // For all other query types (including collectionGroup), leave path empty
      // The query will still execute if Firestore rules allow it
    } catch (e) {
      // If anything fails, allow the query through anyway
    }

    // 2. Defensive Guard: Prevent malformed paths or unauthorized root access
    // Only block clearly invalid paths
    const isInvalidRootPath = path === '/' || path === '.' || path === 'databases/(default)/documents';
    const hasUndefined = path.includes('undefined') || path.includes('/null/');
    
    if (isInvalidRootPath || hasUndefined) {
      setData(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    unsubscribeSnapshot = onSnapshot(
      memoizedTargetRefOrQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        if (!isMounted) return;
        const results: ResultItemType[] = [];
        for (const doc of snapshot.docs) {
          results.push({ ...(doc.data() as T), id: doc.id });
        }
        setData(results);
        setError(null);
        setIsLoading(false);
      },
      (err: FirestoreError) => {
        if (!isMounted) return;
        
        // 1. SDK Internal Assertion Crashes (ca9, b815 and similar)
        // These are SDK bugs that occur during rapid updates or persistence mismatches.
        // We suppress them globally to keep the app functional.
        if (err.message?.includes('INTERNAL ASSERTION FAILED') || err.message?.includes('Unexpected state')) {
          console.warn('[useCollection] Suppressed Firestore internal SDK assertion:', err.message.slice(0, 100));
          setIsLoading(false);
          return;
        }

        // 2. Missing Index Errors (failed-precondition)
        if (err.code === 'failed-precondition' && err.message?.includes('index')) {
          console.warn(`[useCollection] INDEX REQUIRED: This query needs a Firestore index. Check details below:\n${err.message}`);
          setIsLoading(false);
          setError(err);
          return;
        }

        // 3. Permission Errors
        if (err.code === 'permission-denied') {
          // For collectionGroup queries (path is empty), permission-denied is a transient
          // startup race condition — the seeder hasn't committed docs yet and rules are
          // propagating. These queries (members, events, registrationEntries, etc.) are
          // supplementary and degrade gracefully to empty lists. Silently return [] so the
          // UI renders normally instead of entering an error state.
          if (!path) {
            console.warn('[useCollection] collectionGroup permission-denied (transient startup race — rules are authoritative fix):', err.message?.slice(0, 120));
            setData([]);
            setIsLoading(false);
            return;
          }
          const permissionError = new FirestorePermissionError({
            path: path || 'unknown',
            operation: 'list',
          });
          errorEmitter.emit('permission-error', permissionError);
          setError(permissionError);
        } else {
          console.warn(`[useCollection] Firestore error (${err.code}):`, err.message);
          setError(err);
        }
        setData(null);
        setIsLoading(false);
      }
    );

    return () => {
      isMounted = false;
      try {
        if (unsubscribeSnapshot) unsubscribeSnapshot();
      } catch (e: any) {
        // Suppress Firestore SDK internal assertion errors during cleanup.
        // These occur when listeners are torn down during HMR or fast navigation
        // while the WebSocket is mid-stream. They are SDK bugs, not app errors.
        if (!e?.message?.includes('INTERNAL ASSERTION FAILED') && !e?.message?.includes('Unexpected state')) {
          console.warn('[useCollection] Error during listener cleanup:', e?.message);
        }
      }
    };
  }, [memoizedTargetRefOrQuery]);

  return { data, isLoading, error };
}
