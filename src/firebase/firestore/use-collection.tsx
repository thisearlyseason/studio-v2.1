'use client';

import { useState, useEffect } from 'react';
import {
  Query,
  onSnapshot,
  DocumentData,
  FirestoreError,
  QuerySnapshot,
  CollectionReference,
  Unsubscribe,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/** Utility type to add an 'id' field to a given type T. */
export type WithId<T> = T & { id: string };

/**
 * Interface for the return value of the useCollection hook.
 * @template T Type of the document data.
 */
export interface UseCollectionResult<T> {
  data: WithId<T>[] | null; // Document data with ID, or null.
  isLoading: boolean;       // True if loading.
  error: FirestoreError | Error | null; // Error object, or null.
}

/* Internal implementation of Query used for error path extraction */
export interface InternalQuery extends Query<DocumentData> {
  _query: {
    path: {
      canonicalString(): string;
      toString(): string;
    }
  }
}

/**
 * React hook to subscribe to a Firestore collection or query in real-time.
 * 
 * This hook is defensive: it will not attempt to subscribe if the target 
 * reference or query is null or undefined.
 */
export function useCollection<T = any>(
    targetRefOrQuery: ((CollectionReference<DocumentData> | Query<DocumentData>) & {__memo?: boolean}) | null | undefined,
): UseCollectionResult<T> {
  const [data, setData] = useState<WithId<T>[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<FirestoreError | Error | null>(null);

  useEffect(() => {
    // GUARD: Never trigger Firestore if the reference is invalid or null.
    // This prevents attempts to list at the Firestore root level (/documents/).
    if (!targetRefOrQuery) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe: Unsubscribe = onSnapshot(
      targetRefOrQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const results = snapshot.docs.map(doc => ({
          ...(doc.data() as T),
          id: doc.id
        }));
        
        setData(results);
        setError(null);
        setIsLoading(false);
      },
      (err: FirestoreError) => {
        // Extraction logic for path-specific error reporting
        let path: string = '/';
        try {
          path = targetRefOrQuery.type === 'collection'
            ? (targetRefOrQuery as CollectionReference).path
            : (targetRefOrQuery as unknown as InternalQuery)._query.path.canonicalString() || '/';
        } catch (e) {
          // Fallback if path extraction fails
        }

        const contextualError = new FirestorePermissionError({
          operation: 'list',
          path: path || '/',
        });

        console.error("Firestore subscription error:", err);
        setError(contextualError);
        setData(null);
        setIsLoading(false);

        // Global propagation for error boundary handling
        errorEmitter.emit('permission-error', contextualError);
      }
    );

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [targetRefOrQuery]);

  // Project safeguard: Ensure the query reference remains stable across renders.
  if (targetRefOrQuery && !targetRefOrQuery.__memo) {
    throw new Error('useCollection: Firestore queries must be memoized using useMemoFirebase.');
  }

  return { data, isLoading, error };
}