import { getStorage } from 'firebase-admin/storage';
import { getAdminStorageBucketName } from '@/lib/firebase-admin';

export function feedMediaFile(teamId: string, postId: string) {
  return getStorage().bucket(getAdminStorageBucketName()).file(`teams/${teamId}/feed/${postId}/image`);
}
