import { fetchFromHostStorage, uploadToHostStorage } from "../host/storage";
import { decrypt, encrypt } from "./encryption";
import { buildAeadData, decodeEnvelope, encodeEnvelope } from "./envelope";
import {
  MAX_PHOTO_SIZE,
  type ProfilePhotoMetadata,
  VALID_MIME_TYPES,
  type ValidMimeType,
} from "./types";

export { MAX_PHOTO_SIZE, VALID_MIME_TYPES, type ValidMimeType } from "./types";

export function validatePhotoFile(file: File): string | null {
  if (!VALID_MIME_TYPES.includes(file.type as ValidMimeType)) {
    return `Invalid file type. Allowed: ${VALID_MIME_TYPES.join(", ")}`;
  }
  if (file.size > MAX_PHOTO_SIZE) {
    return `File too large. Maximum: ${MAX_PHOTO_SIZE / (1024 * 1024)}MB`;
  }
  return null;
}

export async function uploadProfilePhoto(
  imageData: Uint8Array,
  mimeType: ValidMimeType,
  userId: string,
): Promise<string> {
  const metadata: ProfilePhotoMetadata = {
    type: "localdot/profile-photo/v1",
    userId,
    mimeType,
    cipherSize: 0,
    nonce: "",
    uploadedAt: new Date().toISOString(),
  };

  const aeadData = buildAeadData(metadata);
  const { ciphertext, nonceHex } = await encrypt(imageData, aeadData);

  const finalMetadata: ProfilePhotoMetadata = {
    ...metadata,
    cipherSize: ciphertext.length,
    nonce: nonceHex,
  };

  const envelope = encodeEnvelope(finalMetadata, ciphertext);
  const result = await uploadToHostStorage(
    envelope,
    "bulletin",
    "profile-photo.bin",
  );
  return result.cid;
}

export async function getProfilePhoto(cid: string): Promise<string> {
  const envelopeBytes = await fetchFromHostStorage(cid);
  const { metadata, ciphertext } = decodeEnvelope(envelopeBytes);
  const aeadData = buildAeadData(metadata);
  const plaintext = await decrypt(ciphertext, metadata.nonce, aeadData);
  const buffer = new ArrayBuffer(plaintext.byteLength);
  new Uint8Array(buffer).set(plaintext);
  const blob = new Blob([buffer], { type: metadata.mimeType });
  return URL.createObjectURL(blob);
}

const PHOTO_KEY_PREFIX = "localdot:photo:";

export function savePhotoCid(address: string, cid: string): void {
  localStorage.setItem(`${PHOTO_KEY_PREFIX}${address}`, cid);
}

export function getPhotoCid(address: string): string | null {
  return localStorage.getItem(`${PHOTO_KEY_PREFIX}${address}`);
}

export function removePhotoCid(address: string): void {
  localStorage.removeItem(`${PHOTO_KEY_PREFIX}${address}`);
}
