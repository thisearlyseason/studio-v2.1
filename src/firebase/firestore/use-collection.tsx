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
  const [isLoading, setIsLoading] = useState<boolean>(false);
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

    // TACTICAL GUARD: Wait for authentication identity resolution before querying
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      // Cleanup existing listener if any
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      // Explicitly block queries if the user identity is not yet established
      if (!user || !auth.currentUser) {
        setData(null);
        setIsLoading(false);
        return;
      }

      let path: string = '';
      try {
        if ((memoizedTargetRefOrQuery as any).type === 'collection') {
          path = (memoizedTargetRefOrQuery as CollectionReference).path;
        } else {
          const iq = memoizedTargetRefOrQuery as unknown as InternalQuery;
          path = iq._query?.path?.canonicalString?.() || iq._query?.path?.toString?.() || '';
        }
      } catch (e) {
        path = 'unknown';
      }

      // Prevent unauthorized root-level scans or malformed paths
      const isRootPath = !path || path === '/' || path === '.' || path === 'databases/(default)/documents';
      const hasUndefined = path === 'undefined' || path.includes('/undefined/') || path.endsWith('/undefined');
      
      if (isRootPath || hasUndefined) {
        setData(null);
        setIsLoading(false);
        return;
      }

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
          // Construct rich contextual error for the overlay
          const permissionError = new FirestorePermissionError({
            path: path || 'unknown',
            operation: 'list',
          });
          
          errorEmitter.emit('permission-error', permissionError);
          setError(permissionError);
          setData(null);
          setIsLoading(false);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, [memoizedTargetRefOrQuery]);

  return { data, isLoading, error };
}