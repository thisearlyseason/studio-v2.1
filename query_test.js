import { initializeApp } from 'firebase/app';
import { getFirestore, collectionGroup, query, where, getDocs } from 'firebase/firestore';
// Need environment variables or config. Wait, the project has firebase configured in .env?
