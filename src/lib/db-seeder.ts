
'use client';

import { 
  Firestore, 
  doc, 
  collection, 
  getDocs, 
  writeBatch 
} from 'firebase/firestore';

/**
 * Seeds the Firestore database with default plans and features if they don't exist.
 * This is designed to run once or during administrative sessions to establish the single source of truth.
 */
export async function seedSubscriptionData(db: Firestore) {
  try {
    // 1. Seed Features if missing
    const featuresSnapshot = await getDocs(collection(db, 'features'));
    if (featuresSnapshot.empty) {
      console.log('Seeding default features...');
      const batch = writeBatch(db);
      
      const defaultFeatures = [
        { id: 'schedule_games_events', description: 'Plan and coordinate team matches and events.', defaultEnabled: true },
        { id: 'tournaments', description: 'Manage multi-day tournament series and brackets.', defaultEnabled: false },
        { id: 'basic_roster', description: 'Manage a basic list of team members.', defaultEnabled: true },
        { id: 'full_roster_details', description: 'Track medical info, emergency contacts, and coaching notes.', defaultEnabled: false },
        { id: 'attendance_tracking', description: 'Track RSVPs and real-time attendance for events.', defaultEnabled: false },
        { id: 'live_feed_read', description: 'View the squad activity feed.', defaultEnabled: true },
        { id: 'live_feed_post', description: 'Post updates, photos, and polls to the squad.', defaultEnabled: false },
        { id: 'group_chat', description: 'Real-time messaging channels for coordination.', defaultEnabled: false },
        { id: 'score_tracking', description: 'Record game results and season progress.', defaultEnabled: false },
        { id: 'stats_basic', description: 'Basic performance metrics and trends.', defaultEnabled: false },
        { id: 'media_uploads', description: 'Upload and share playbooks, photos, and files.', defaultEnabled: false },
        { id: 'history_unlimited', description: 'Retain full history of posts, chats, and results.', defaultEnabled: false },
      ];

      defaultFeatures.forEach((f) => {
        const ref = doc(db, 'features', f.id);
        batch.set(ref, {
          id: f.id,
          description: f.description,
          defaultEnabled: f.defaultEnabled
        });
      });

      await batch.commit();
    }

    // 2. Seed Plans if missing
    const plansSnapshot = await getDocs(collection(db, 'plans'));
    if (plansSnapshot.empty) {
      console.log('Seeding default plans...');
      const batch = writeBatch(db);

      const allFeaturesMap = {
        schedule_games_events: true,
        tournaments: true,
        basic_roster: true,
        full_roster_details: true,
        attendance_tracking: true,
        live_feed_read: true,
        live_feed_post: true,
        group_chat: true,
        score_tracking: true,
        stats_basic: true,
        media_uploads: true,
        history_unlimited: true
      };

      const starterFeatures = {
        schedule_games_events: true,
        basic_roster: true,
        live_feed_read: true
      };

      const plans = [
        {
          id: 'starter_squad',
          name: 'Starter Squad',
          description: 'Basic coordination essentials for growing teams.',
          isPublic: true,
          isContactOnly: false,
          billingType: 'free',
          teamLimit: 1,
          features: starterFeatures
        },
        {
          id: 'squad_pro',
          name: 'Squad Pro',
          description: 'Full-scale coordination and analytics for elite squads.',
          isPublic: true,
          isContactOnly: false,
          billingType: 'monthly', // Also annual logic
          teamLimit: 5,
          features: allFeaturesMap
        },
        {
          id: 'club_custom',
          name: 'Club / Custom',
          description: 'Custom solutions for leagues and multi-team organizations.',
          isPublic: false,
          isContactOnly: true,
          billingType: 'manual',
          teamLimit: null,
          features: allFeaturesMap
        }
      ];

      plans.forEach((p) => {
        const ref = doc(db, 'plans', p.id);
        batch.set(ref, p);
      });

      await batch.commit();
    }
  } catch (error) {
    console.error('Error seeding subscription data:', error);
  }
}
