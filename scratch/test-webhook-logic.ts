import Stripe from 'stripe';
import { initializeFirebase } from '../src/firebase/core';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, setDoc } from 'firebase/firestore';
import { PRICING_CONFIG, EXTRA_TEAM_CONFIG } from '../src/lib/pricing';

// MOCK DATA
const MOCK_USER_ID = 'VaxrWL1o4Mhd60VoxE9oTZFKCir1'; // Using the ID from the user's previous logs
const MOCK_CUSTOMER_ID = 'cus_test_123';
const MOCK_SUBSCRIPTION_ID = 'sub_test_123';
const MOCK_PRICE_ID = 'price_1TL4qyGu1UxxOYbPen5QOIJv'; // Individual Team Monthly from .env.local

async function testSyncLogic() {
  console.log('--- STARTING WEBHOOK SYNC SIMULATION ---');
  
  const { firestore } = initializeFirebase();
  
  // 1. Setup Mock Subscription object
  const mockSubscription = {
    id: MOCK_SUBSCRIPTION_ID,
    customer: MOCK_CUSTOMER_ID,
    status: 'active',
    current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
    metadata: {
      firebase_uid: MOCK_USER_ID
    },
    items: {
      data: [
        {
          price: {
            id: MOCK_PRICE_ID
          },
          quantity: 1
        }
      ]
    }
  } as any;

  console.log(`Simulating sync for User: ${MOCK_USER_ID}, Price: ${MOCK_PRICE_ID}`);

  // COPY OF WEBHOOK SYNC LOGIC
  try {
    let userId = mockSubscription.metadata?.firebase_uid;
    console.log(`[DEBUG] Resolved userId from metadata: ${userId}`);

    if (!userId) {
      console.log('[DEBUG] Metadata missing. Checking Firestore index...');
      const usersRef = collection(firestore, 'users');
      const q = query(usersRef, where('stripe_customer_id', '==', MOCK_CUSTOMER_ID));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        userId = querySnapshot.docs[0].id;
      }
    }

    if (!userId) {
      throw new Error('Could not resolve userId');
    }

    let planType = 'free';
    let baseLimit = 1;
    let extraTeams = 0;

    for (const item of mockSubscription.items.data) {
      const priceId = item.price.id;
      const matchedPlan = PRICING_CONFIG.find(p => p.monthlyPriceId === priceId || p.annualPriceId === priceId);
      
      if (matchedPlan) {
        planType = matchedPlan.id;
        baseLimit = matchedPlan.teamLimit;
        console.log(`[DEBUG] Matched plan: ${planType}`);
      } else if (priceId === EXTRA_TEAM_CONFIG.monthlyPriceId || priceId === EXTRA_TEAM_CONFIG.annualPriceId) {
        extraTeams += (item.quantity || 0);
      }
    }

    const userRef = doc(firestore, 'users', userId);
    const status = mockSubscription.status;
    const isActive = status === 'active';

    console.log(`[DEBUG] Final State -> Plan: ${planType}, Limit: ${baseLimit + extraTeams}`);

    await updateDoc(userRef, {
      stripe_subscription_id: mockSubscription.id,
      stripe_customer_id: MOCK_CUSTOMER_ID,
      subscription_status: status,
      plan_type: isActive ? planType : 'free',
      team_limit: isActive ? (baseLimit + extraTeams) : 1,
      extra_teams: extraTeams,
      last_webhook_sync: new Date().toISOString()
    });

    console.log('--- SYNC SUCCESSFUL ---');
    
    // VERIFY
    const updatedSnap = await getDoc(userRef);
    console.log('Resulting Firestore Data:', updatedSnap.data());

  } catch (err: any) {
    console.error('--- SYNC FAILED ---');
    console.error(err.message);
  }
}

testSyncLogic();
