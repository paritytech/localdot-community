/**
 * Type definitions for Host API storage
 */

/**
 * Storage upload result
 */
export interface HostStorageUploadResult {
  /** Content identifier */
  cid: string;
  /** Gateway URL to access the content */
  gatewayUrl?: string;
}
