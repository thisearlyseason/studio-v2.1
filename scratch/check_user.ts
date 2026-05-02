import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const projectId = 'studio-6850142148-fe343';

if (!getApps().length) {
  initializeApp({ projectId });
}

async function checkUser() {
  try {
    const user = await getAuth().getUserByEmail('example@gmail.com');
    console.log('User found:', user.uid);
  } catch (error) {
    console.error('Error fetching user:', error);
  }
}

checkUser();
