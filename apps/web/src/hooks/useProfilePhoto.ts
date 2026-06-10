import { useCallback, useState } from "react";

import {
  getProfilePhoto,
  savePhotoCid,
  uploadProfilePhoto,
  validatePhotoFile,
  type ValidMimeType,
} from "../lib/photo";

interface UseProfilePhotoReturn {
  upload: (file: File, userId: string) => Promise<string>;
  getPhotoUrl: (cid: string) => Promise<string>;
  isUploading: boolean;
  error: string | null;
  clearError: () => void;
}

export function useProfilePhoto(): UseProfilePhotoReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File, userId: string): Promise<string> => {
      setError(null);
      setIsUploading(true);

      try {
        const validationError = validatePhotoFile(file);
        if (validationError) {
          throw new Error(validationError);
        }

        const arrayBuffer = await file.arrayBuffer();
        const imageData = new Uint8Array(arrayBuffer);
        const cid = await uploadProfilePhoto(
          imageData,
          file.type as ValidMimeType,
          userId,
        );
        savePhotoCid(userId, cid);
        return cid;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setError(message);
        throw err;
      } finally {
        setIsUploading(false);
      }
    },
    [],
  );

  const getPhotoUrl = useCallback(
    async (cid: string): Promise<string> => await getProfilePhoto(cid),
    [],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return { upload, getPhotoUrl, isUploading, error, clearError };
}
