const admin = require('firebase-admin');

// Initialize app with default credentials if running in a Firebase functions environment
// OR you can use serviceAccount if needed, but usually process.env.GOOGLE_APPLICATION_CREDENTIALS works.
// Actually, I can just initialize app and run it locally with 'firebase-admin' if I set FIRESTORE_EMULATOR_HOST or run it via firebase tools.
// Let's just use the current project locally.
admin.initializeApp({ projectId: 'studio-6850142148-fe343' });

async function setPassword() {
  try {
    const uid = 'ai2QThECAwfkAFw608m7TgPZTmk2'; // thisearlyseason@gmail.com
    await admin.auth().updateUser(uid, {
      password: 'Password123!',
    });
    console.log('Successfully updated user password to Password123!');
  } catch (error) {
    console.log('Error updating user:', error);
  }
}

setPassword();
