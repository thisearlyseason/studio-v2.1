const fs = require('fs');

let content = fs.readFileSync('src/app/login/page.tsx', 'utf8');

// Replace imports
content = content.replace(
  "import { useAuth } from '@/firebase';",
  "import { useAuth, useUser, useFirestore } from '@/firebase';\nimport { initiateEmailSignIn } from '@/firebase/non-blocking-login';\nimport { doc, getDoc } from 'firebase/firestore';"
);

// Add useEffect
const useEffectRegex = /const handleLogin = async \(e: React\.FormEvent\) => \{/;
content = content.replace(
  useEffectRegex,
  `const { user, isUserLoading } = useUser();
  const db = useFirestore();

  React.useEffect(() => {
    if (!isUserLoading && user) {
      const fetchRole = async () => {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            if (data.role === 'admin' || data.role === 'superadmin' || data.isSchoolAdmin) {
              router.push('/club');
            } else {
              router.push('/dashboard');
            }
          } else {
            router.push('/dashboard');
          }
        } catch (e) {
          router.push('/dashboard');
        }
      };
      fetchRole();
    }
  }, [user, isUserLoading, db, router]);

  const handleLogin = async (e: React.FormEvent) => {`
);

// Replace handleLogin content
content = content.replace(
  /await signInWithEmailAndPassword\(auth, email, password\);\n      router\.push\(\'\/dashboard\'\);/g,
  "initiateEmailSignIn(auth, email, password);"
);

fs.writeFileSync('src/app/login/page.tsx', content);
