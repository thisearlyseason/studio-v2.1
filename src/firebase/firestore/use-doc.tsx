'use client';
    
import { useState, useEffect } from 'react';
import {
  DocumentReference,
  onSnapshot,
  DocumentData,
  FirestoreError,
  DocumentSnapshot,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/** Utility type to add an 'id' field to a given type T. */
type WithId<T> = T & { id: string };

/**
 * Interface for the return value of the useDoc hook.
 * @template T Type of the document data.
 */
export interface UseDocResult<T> {
  data: WithId<T> | null; // Document data with ID, or null.
  isLoading: boolean;       // True if loading.
  error: FirestoreError | Error | null; // Error object, or null.
}

/**
 * React hook to subscribe to a single Firestore document in real-time.
 * Handles nullable references.
 * 
 * IMPORTANT! YOU MUST MEMOIZE the inputted memoizedTargetRefOrQuery or BAD THINGS WILL HAPPEN
 * use useMemo to memoize it per React guidence.  Also make sure that it's dependencies are stable
 * references
 *
 *
 * @template T Optional type for document data. Defaults to any.
 * @param {DocumentReference<DocumentData> | null | undefined} docRef -
 * The Firestore DocumentReference. Waits if null/undefined.
 * @returns {UseDocResult<T>} Object with data, isLoading, error.
 */
export function useDoc<T = any>(
  memoizedDocRef: DocumentReference<DocumentData> | null | undefined,
): UseDocResult<T> {
  type StateDataType = WithId<T> | null;

  const [data, setData] = useState<StateDataType>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<FirestoreError | Error | null>(null);

  useEffect(() => {
    if (!memoizedDocRef) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    // Optional: setData(null); // Clear previous data instantly

    const unsubscribe = onSnapshot(
      memoizedDocRef,
      (snapshot: DocumentSnapshot<DocumentData>) => {
        if (snapshot.exists()) {
          setData({ ...(snapshot.data() as T), id: snapshot.id });
        } else {
          // Document does not exist
          setData(null);
        }
        setError(null); // Clear any previous error on successful snapshot (even if doc doesn't exist)
        setIsLoading(false);
      },
      (error: FirestoreError) => {
        // Suppress Firestore SDK internal assertion/state errors — these are SDK bugs,
        // not application errors, triggered during HMR or rapid listener teardown.
        if (error.message?.includes('INTERNAL ASSERTION FAILED') || error.message?.includes('Unexpected state')) {
          console.warn('[useDoc] Suppressed Firestore internal SDK assertion:', error.message.slice(0, 80));
          setIsLoading(false);
          return;
        }
        if (error.code === 'permission-denied') {
          const contextualError = new FirestorePermissionError({
            operation: 'get',
            path: memoizedDocRef.path,
          });
          setError(contextualError);
          errorEmitter.emit('permission-error', contextualError);
        } else {
          console.warn(`[useDoc] Non-permission Firestore error (${error.code}):`, error.message);
          setError(error);
        }
        setData(null);
        setIsLoading(false);
      }
    );

    return () => {
      try {
        unsubscribe();
      } catch (e: any) {
        // Suppress Firestore SDK internal assertion errors during cleanup.
        if (!e?.message?.includes('INTERNAL ASSERTION FAILED') && !e?.message?.includes('Unexpected state')) {
          console.warn('[useDoc] Error during listener cleanup:', e?.message);
        }
      }
    };
  }, [memoizedDocRef]); // Re-run if the memoizedDocRef changes.

  return { data, isLoading, error };
}