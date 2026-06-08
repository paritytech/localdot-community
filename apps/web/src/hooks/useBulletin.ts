import { useCallback } from "react";

import {
  uploadJsonToHostStorage,
  uploadToHostStorage,
} from "../lib/host/storage";

export interface UploadResult {
  cid: string;
  blockHash: string;
  gatewayUrl: string;
}

interface UseBulletinReturn {
  /** Upload a file to Bulletin Chain, returns CID */
  uploadFile: (file: File) => Promise<string>;
  /** Upload JSON data to Bulletin Chain, returns CID */
  uploadJson: (data: unknown, filename?: string) => Promise<string>;
}

/**
 * Hook for uploading data to Bulletin Chain.
 *
 * Uploads under the host's RFC-0010 Bulletin allowance (the user's own
 * account) — requires the Polkadot host (dot.li / Polkadot Desktop).
 */
export function useBulletin(): UseBulletinReturn {
  const uploadFile = useCallback(async (file: File): Promise<string> => {
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const result = await uploadToHostStorage(fileBytes, "bulletin", file.name);
    return result.cid;
  }, []);

  const uploadJson = useCallback(
    async (data: unknown, filename = "data.json"): Promise<string> =>
      await uploadJsonToHostStorage(data, filename),
    [],
  );

  return {
    uploadFile,
    uploadJson,
  };
}
