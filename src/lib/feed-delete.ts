export async function deleteFeedPostOptimistically({
  postId,
  hide,
  restore,
  deleteRemote,
}: {
  postId: string;
  hide: (postId: string) => void;
  restore: (postId: string) => void;
  deleteRemote: () => Promise<unknown>;
}) {
  hide(postId);
  try {
    await deleteRemote();
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'status' in error && error.status === 404) return;
    restore(postId);
    throw error;
  }
}
