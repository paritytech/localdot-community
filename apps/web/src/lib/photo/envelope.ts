import { MAGIC_BYTES, type ProfilePhotoMetadata } from "./types";

export function buildAeadData(metadata: ProfilePhotoMetadata): Uint8Array {
  const { type, userId, mimeType, uploadedAt } = metadata;
  const json = JSON.stringify({ type, userId, mimeType, uploadedAt });
  return new TextEncoder().encode(json);
}

export function encodeEnvelope(
  metadata: ProfilePhotoMetadata,
  ciphertext: Uint8Array,
): Uint8Array {
  const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
  const metadataLength = metadataBytes.length;

  const lengthBytes = new Uint8Array(4);
  new DataView(lengthBytes.buffer).setUint32(0, metadataLength, true);

  const totalLength =
    MAGIC_BYTES.length +
    lengthBytes.length +
    metadataBytes.length +
    ciphertext.length;
  const envelope = new Uint8Array(totalLength);

  let offset = 0;

  envelope.set(MAGIC_BYTES, offset);
  offset += MAGIC_BYTES.length;

  envelope.set(lengthBytes, offset);
  offset += lengthBytes.length;

  envelope.set(metadataBytes, offset);
  offset += metadataBytes.length;

  envelope.set(ciphertext, offset);

  return envelope;
}

export interface DecodedEnvelope {
  metadata: ProfilePhotoMetadata;
  ciphertext: Uint8Array;
}

export function decodeEnvelope(bytes: Uint8Array): DecodedEnvelope {
  if (bytes.length < MAGIC_BYTES.length + 4) {
    throw new Error("Envelope too short");
  }

  const magic = bytes.slice(0, MAGIC_BYTES.length);
  if (!magic.every((b, i) => b === MAGIC_BYTES[i])) {
    throw new Error("Invalid envelope magic bytes");
  }

  const lengthView = new DataView(
    bytes.buffer,
    bytes.byteOffset + MAGIC_BYTES.length,
    4,
  );
  const metadataLength = lengthView.getUint32(0, true);

  const metadataStart = MAGIC_BYTES.length + 4;
  const metadataEnd = metadataStart + metadataLength;

  if (bytes.length < metadataEnd) {
    throw new Error("Envelope truncated: missing metadata");
  }

  const metadataBytes = bytes.slice(metadataStart, metadataEnd);
  const metadataJson = new TextDecoder().decode(metadataBytes);

  let metadata: ProfilePhotoMetadata;
  try {
    metadata = JSON.parse(metadataJson) as ProfilePhotoMetadata;
  } catch {
    throw new Error("Invalid envelope metadata JSON");
  }

  if (metadata.type !== "localdot/profile-photo/v1") {
    throw new Error(`Unknown envelope type: ${String(metadata.type)}`);
  }

  const ciphertext = bytes.slice(metadataEnd);

  return { metadata, ciphertext };
}
