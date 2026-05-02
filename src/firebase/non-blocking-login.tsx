'use client';
import {
  Auth, // Import Auth type for type hinting
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  // Assume getAuth and app are initialized elsewhere
} from 'firebase/auth';

/** Initiate anonymous sign-in (non-blocking). */
export function initiateAnonymousSignIn(authInstance: Auth): void {
  console.log("Firebase: Initiating anonymous sign-in...");
  signInAnonymously(authInstance).catch(err => {
    console.error("Firebase: Anonymous sign-in failed:", err);
  });
}

/** Initiate email/password sign-up (non-blocking). */
export function initiateEmailSignUp(authInstance: Auth, email: string, password: string): void {
  console.log(`Firebase: Initiating sign-up for ${email}...`);
  createUserWithEmailAndPassword(authInstance, email, password).catch(err => {
    console.error("Firebase: Sign-up failed:", err);
  });
}

/** Initiate email/password sign-in (non-blocking). */
export function initiateEmailSignIn(authInstance: Auth, email: string, password: string): void {
  console.log(`Firebase: Initiating sign-in for ${email}...`);
  signInWithEmailAndPassword(authInstance, email, password).catch(err => {
    console.error("Firebase: Sign-in failed:", err);
  });
}
