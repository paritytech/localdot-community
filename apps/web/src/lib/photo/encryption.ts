import { APP_KEY_SEED } from "./types";

let cachedKey: CryptoKey | null = null;

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(hex.length / 2);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  if (
    data.buffer instanceof ArrayBuffer &&
    data.byteOffset === 0 &&
    data.byteLength === data.buffer.byteLength
  ) {
    return data.buffer;
  }
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  return buffer;
}

export async function deriveAppKey(): Promise<CryptoKey> {
  if (cachedKey) {
    return cachedKey;
  }

  const encoder = new TextEncoder();
  const seedBytes = encoder.encode(APP_KEY_SEED);

  const hashBuffer = await crypto.subtle.digest("SHA-256", seedBytes);

  cachedKey = await crypto.subtle.importKey(
    "raw",
    hashBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );

  return cachedKey;
}

export interface EncryptResult {
  ciphertext: Uint8Array;
  nonceHex: string;
}

export async function encrypt(
  plaintext: Uint8Array,
  additionalData?: Uint8Array,
): Promise<EncryptResult> {
  const key = await deriveAppKey();
  const nonceBuffer = new ArrayBuffer(12);
  const nonce = new Uint8Array(nonceBuffer);
  crypto.getRandomValues(nonce);

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce,
      additionalData: additionalData
        ? toArrayBuffer(additionalData)
        : undefined,
    },
    key,
    toArrayBuffer(plaintext),
  );

  return {
    ciphertext: new Uint8Array(ciphertext),
    nonceHex: bytesToHex(nonce),
  };
}

export async function decrypt(
  ciphertext: Uint8Array,
  nonceHex: string,
  additionalData?: Uint8Array,
): Promise<Uint8Array> {
  const key = await deriveAppKey();
  const nonce = hexToBytes(nonceHex);

  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: nonce,
      additionalData: additionalData
        ? toArrayBuffer(additionalData)
        : undefined,
    },
    key,
    toArrayBuffer(ciphertext),
  );

  return new Uint8Array(plaintext);
}
