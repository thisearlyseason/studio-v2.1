
'use client';
    
import {
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  CollectionReference,
  DocumentReference,
  SetOptions,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import {FirestorePermissionError} from '@/firebase/errors';

// Section 5: Rate Limiting / Write Cooldowns
const writeCooldowns = new Map<string, number>();
const COOLDOWN_MS = 1000; // 1 second throttle per document

function checkCooldown(path: string): boolean {
  const now = Date.now();
  const last = writeCooldowns.get(path) || 0;
  if (now - last < COOLDOWN_MS) {
    console.warn(`Write throttled for ${path}`);
    return false;
  }
  writeCooldowns.set(path, now);
  return true;
}

/**
 * Initiates a setDoc operation for a document reference.
 * Throttled to prevent accidental billing spikes from UI loops.
 */
export function setDocumentNonBlocking(docRef: DocumentReference, data: any, options: SetOptions) {
  if (!checkCooldown(docRef.path)) return;
  setDoc(docRef, data, options).catch(error => {
    errorEmitter.emit(
      'permission-error',
      new FirestorePermissionError({
        path: docRef.path,
        operation: 'write',
        requestResourceData: data,
      })
    )
  })
}


/**
 * Initiates an addDoc operation for a collection reference.
 */
export function addDocumentNonBlocking(colRef: CollectionReference, data: any) {
  // Collection additions aren't throttled by path since they generate new IDs
  const promise = addDoc(colRef, data)
    .catch(error => {
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: colRef.path,
          operation: 'create',
          requestResourceData: data,
        })
      )
    });
  return promise;
}


/**
 * Initiates an updateDoc operation for a document reference.
 * Throttled to prevent rapid-fire updates.
 */
export function updateDocumentNonBlocking(docRef: DocumentReference, data: any) {
  if (!checkCooldown(docRef.path)) return;
  updateDoc(docRef, data)
    .catch(error => {
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: docRef.path,
          operation: 'update',
          requestResourceData: data,
        })
      )
    });
}


/**
 * Initiates a deleteDoc operation for a document reference.
 */
export function deleteDocumentNonBlocking(docRef: DocumentReference) {
  deleteDoc(docRef)
    .catch(error => {
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: docRef.path,
          operation: 'delete',
        })
      )
    });
}
