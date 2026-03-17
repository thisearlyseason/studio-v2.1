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

/* Internal implementation of Query:
  https://github.com/firebase/firebase-js-sdk/blob/c5f08a9bc5da0d2b0207802c972d53724ccef055/packages/firestore/src/lite-api/reference.ts#L143
*/
export interface InternalQuery extends Query<DocumentData> {
  _query?: {
    path?: {
      canonicalString?(): string;
      toString?(): string;
    }
  }
}

/**
 * React hook to subscribe to a Firestore collection or query in real-time.
 * Handles nullable references/queries.
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
    if (!memoizedTargetRefOrQuery) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    // TACTICAL GUARD: Prevent root-level scans or uninitialized paths.
    let path: string = '';
    try {
      if (memoizedTargetRefOrQuery.type === 'collection') {
        path = (memoizedTargetRefOrQuery as CollectionReference).path;
      } else {
        const iq = memoizedTargetRefOrQuery as unknown as InternalQuery;
        path = iq._query?.path?.canonicalString?.() || iq._query?.path?.toString?.() || '';
      }
    } catch (e) {
      path = 'unknown';
    }

    // CRITICAL SECURITY GUARD:
    // If the path is empty, points to document root, or contains undefined segments, 
    // do not establish a listener. Querying the root /databases/(default)/documents path 
    // is forbidden by security rules and will cause immediate permission errors.
    const isRootPath = !path || path === '/' || path === '.' || path === '';
    const hasUndefinedSegments = path === 'undefined' || path.includes('/undefined/') || path.endsWith('/undefined');
    const isMalformed = path.includes('[object Object]') || path.includes('null');

    if (isRootPath || hasUndefinedSegments || isMalformed) {
      setData(null);
      setIsLoading(false);
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
        // Create the rich, contextual error asynchronously.
        const permissionError = new FirestorePermissionError({
          path: path || 'unknown',
          operation: 'list',
        });

        // Emit the error with the global error emitter
        errorEmitter.emit('permission-error', permissionError);

        setError(permissionError);
        setData(null);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [memoizedTargetRefOrQuery]); 
  
  return { data, isLoading, error };
}