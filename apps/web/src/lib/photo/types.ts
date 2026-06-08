export interface ProfilePhotoMetadata {
  type: "localdot/profile-photo/v1";
  userId: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  cipherSize: number;
  nonce: string;
  uploadedAt: string;
}

export const MAGIC_BYTES = new Uint8Array([0x54, 0x46, 0x56, 0x31]); // "TFV1"

export const VALID_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ValidMimeType = (typeof VALID_MIME_TYPES)[number];

export const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB

export const APP_KEY_SEED = "localdot-profile-photos-v1";
