type StorageMetadata = { fullPath?: string };

type FilmDeletionOptions = {
  storagePath?: string | null;
  deleteStorageObject: (path: string) => Promise<void>;
  readStorageObject: (path: string) => Promise<StorageMetadata>;
  deleteMetadata: () => Promise<void>;
  maxAttempts?: number;
};

function isStorageObjectMissing(error: unknown): boolean {
  return !!error && typeof error === 'object' &&
    'code' in error && error.code === 'storage/object-not-found';
}

export async function reconcilePlayerFilmDeletion({
  storagePath,
  deleteStorageObject,
  readStorageObject,
  deleteMetadata,
  maxAttempts = 3,
}: FilmDeletionOptions): Promise<void> {
  if (storagePath) {
    let confirmedAbsent = false;
    for (let attempt = 1; attempt <= maxAttempts && !confirmedAbsent; attempt += 1) {
      try {
        await deleteStorageObject(storagePath);
      } catch (error) {
        if (isStorageObjectMissing(error)) {
          confirmedAbsent = true;
          break;
        }
        throw error;
      }

      try {
        await readStorageObject(storagePath);
      } catch (error) {
        if (isStorageObjectMissing(error)) {
          confirmedAbsent = true;
          break;
        }
        throw error;
      }
    }
    if (!confirmedAbsent) {
      throw new Error(`Film Storage object still exists after ${maxAttempts} delete attempts.`);
    }
  }

  await deleteMetadata();
}
