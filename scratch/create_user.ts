import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  "projectId": "studio-6850142148-fe343",
  "appId": "1:61782012212:web:8913d2b40fd9843148f561",
  "apiKey": "AIzaSyA8G2_7gu0WK8efQ9sl7UJG6tsrC7iOCdU",
  "authDomain": "studio-6850142148-fe343.firebaseapp.com",
  "storageBucket": "studio-6850142148-fe343.firebasestorage.app",
  "messagingSenderId": "61782012212"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

async function createUser() {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, 'tester_' + Math.random().toString(36).substring(7) + '@example.com', 'password123');
    console.log('User created:', userCredential.user.email, userCredential.user.uid);
  } catch (error: any) {
    console.error('Create user failed:', error.code, error.message);
  }
}

createUser();
