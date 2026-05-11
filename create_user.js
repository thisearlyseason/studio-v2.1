const { initializeApp } = require('firebase/app');
const { getAuth, createUserWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, doc, setDoc } = require('firebase/firestore');

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
const db = getFirestore(app);

async function createSuperAdmin() {
  try {
    const email = "admin@thesquad.pro";
    const password = "Password123!";
    
    console.log("Creating user account...");
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    console.log("Successfully created user with UID:", user.uid);
    
    console.log("Writing to Firestore users collection...");
    await setDoc(doc(db, 'users', user.uid), {
      id: user.uid,
      email: email,
      fullName: "Super Admin",
      role: "superadmin",
      createdAt: new Date().toISOString()
    });
    
    console.log("Success! Account is ready.");
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    
    // We also need to print the UID so we can add it to firestore.rules
    console.log(`UID: ${user.uid}`);
    
    process.exit(0);
  } catch (error) {
    console.error("Error creating super admin:", error);
    process.exit(1);
  }
}

createSuperAdmin();
