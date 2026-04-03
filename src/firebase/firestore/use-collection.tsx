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

    // 3. Establish Real-time Listener
    setIsLoading(true);
    setError(null);

    unsubscribeSnapshot = onSnapshot(
      memoizedTargetRefOrQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const results: ResultItemType[] = [];
        for (const doc of snapshot.docs) {
          results.push({ ...(doc.data() as T), id: doc.id });
        }
        setData(results);
        setError(null);
        setIsLoading(false);
      },
      (err: FirestoreError) => {
        // Only surface permission-denied errors to the error overlay.
        // Other errors (missing index, network, unavailable, etc.) are
        // logged but should not block the entire UI.
        if (err.code === 'permission-denied') {
          const permissionError = new FirestorePermissionError({
            path: path || 'unknown',
            operation: 'list',
          });
          errorEmitter.emit('permission-error', permissionError);
          setError(permissionError);
        } else {
          console.warn(`[useCollection] Non-permission Firestore error (${err.code}):`, err.message);
          setError(err);
        }
        setData(null);
        setIsLoading(false);
      }
    );

    return () => {
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, [memoizedTargetRefOrQuery]);

  return { data, isLoading, error };
}
