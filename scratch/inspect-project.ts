import Stripe from 'stripe';
import { initializeFirebase } from '../src/firebase/core';
import { doc, getDoc } from 'firebase/firestore';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2025-03-31.basil',
});

async function inspectProject() {
  console.log('--- STRIPE PROJECT INSPECTION ---');
  
  try {
    const prices = await stripe.prices.list({ active: true, limit: 100 });
    console.log(`Active Prices Found: ${prices.data.length}`);
    prices.data.forEach(p => {
      console.log(`ID: ${p.id} | Product: ${p.product} | Unit Amount: ${p.unit_amount_decimal} | Nickname: ${p.nickname || 'N/A'}`);
    });

    console.log('\n--- USER DOC INSPECTION ---');
    const { firestore } = initializeFirebase();
    const userId = 'VaxrWL1o4Mhd60VoxE9oTZFKCir1'; // Using the ID from earlier context
    const userRef = doc(firestore, 'users', userId);
    const snap = await getDoc(userRef);
    
    if (snap.exists()) {
      const data = snap.data();
      console.log(`User Found: ${userId}`);
      console.log(`Plan: ${data.plan_type}`);
      console.log(`Stripe Sub ID: ${data.stripe_subscription_id || 'MISSING'}`);
      console.log(`Stripe Cust ID: ${data.stripe_customer_id || 'MISSING'}`);
      console.log(`Team Limit: ${data.team_limit}`);
    } else {
      console.log('User not found in Firestore');
    }

  } catch (err: any) {
    console.error('Inspection Error:', err.message);
  }
}

inspectProject();
