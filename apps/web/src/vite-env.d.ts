// / <reference types="vite/client" />

// Image imports
declare module "*.png" {
  const src: string;
  export default src;
}

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_CHAIN_ID?: string;
  readonly VITE_NETWORK?: string;
  readonly VITE_P2PMARKET_ADDRESS?: string;
  readonly VITE_ZKPASSPORT_REGISTRY_ADDRESS?: string;
  readonly VITE_IPFS_GATEWAY?: string;
  readonly VITE_READONLY_ORIGIN?: string;
  readonly VITE_USE_HOST_API?: string;
  readonly VITE_REAL_CAMERA?: string;
  readonly VITE_REAL_LOCATION?: string;
  readonly VITE_REAL_CHAIN?: string;
  readonly VITE_REAL_TRADE?: string;
  readonly VITE_ZKPASSPORT_DOMAIN?: string;
  readonly VITE_ZKPASSPORT_DEV_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
