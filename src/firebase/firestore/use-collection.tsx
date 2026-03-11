
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
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export type WithId<T> = T & { id: string };

export interface UseCollectionResult<T> {
  data: WithId<T>[] | null;
  isLoading: boolean;
  error: FirestoreError | Error | null;
}

export interface InternalQuery extends Query<DocumentData> {
  _query: {
    path: {
      canonicalString(): string;
      toString(): string;
      isEmpty(): boolean;
    }
  }
}

/**
 * React hook to subscribe to a Firestore collection or query in real-time.
 * Hardened with strictly defensive path guards to prevent unauthorized root listing.
 */
export function useCollection<T = any>(
    memoizedTargetRefOrQuery: ((CollectionReference<DocumentData> | Query<DocumentData>) & {__memo?: boolean})  | null | undefined,
): UseCollectionResult<T> {
  type ResultItemType = WithId<T>;
  type StateDataType = ResultItemType[] | null;

  const [data, setData] = useState<StateDataType>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<FirestoreError | Error | null>(null);

  useEffect(() => {
    // 1. Strict Early Return: Skip if target is null or undefined (initial auth loading state)
    if (!memoizedTargetRefOrQuery) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    // 2. Extract path for defensive verification
    let path = '';
    let isCollectionGroup = false;
    try {
      // @ts-ignore - internal property access for defensive path checking
      isCollectionGroup = (memoizedTargetRefOrQuery as any)._query?.path?.isEmpty?.() || false;
      
      // @ts-ignore - check if it's a collection reference or query
      if ((memoizedTargetRefOrQuery as any).type === 'collection') {
        path = (memoizedTargetRefOrQuery as CollectionReference).path;
      } else {
        const internalQuery = memoizedTargetRefOrQuery as unknown as InternalQuery;
        path = internalQuery._query?.path?.canonicalString() || '';
      }
    } catch (e) {}

    // 3. Strict Guard: Prevent uninitialized or database root-level listing requests (// or /)
    const trimmedPath = (path || '').trim();
    if (!isCollectionGroup && (!trimmedPath || trimmedPath === '/' || trimmedPath === '' || trimmedPath === '//')) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = onSnapshot(
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
        // 4. Final Guard: Suppress permission errors for root paths that should never have fired
        if (!trimmedPath || trimmedPath === '/' || trimmedPath === '' || trimmedPath === '//') {
          setIsLoading(false);
          return;
        }

        const contextualError = new FirestorePermissionError({
          operation: 'list',
          path: trimmedPath || '/',
        });

        setError(contextualError);
        setData(null);
        setIsLoading(false);
        errorEmitter.emit('permission-error', contextualError);
      }
    );

    return () => unsubscribe();
  }, [memoizedTargetRefOrQuery]);

  return { data, isLoading, error };
}
