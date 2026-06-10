/**
 * Merkle Tree Utilities
 *
 * Incremental blake2b Merkle tree for video chunk hashes.
 * The tree grows as chunks are added, and the root can be
 * queried at any time for commitment.
 */

import { blake2b } from "@noble/hashes/blake2b";

import type { MerkleProof, MerkleTree } from "./types";

// Domain separation prefix for Merkle hashing
const LEAF_PREFIX = new Uint8Array([0x00]);
const NODE_PREFIX = new Uint8Array([0x01]);

/**
 * Hash a leaf (chunk hash) with domain separation
 */
export function hashLeaf(data: Uint8Array): Uint8Array {
  const prefixed = new Uint8Array(LEAF_PREFIX.length + data.length);
  prefixed.set(LEAF_PREFIX, 0);
  prefixed.set(data, LEAF_PREFIX.length);
  return blake2b(prefixed, { dkLen: 32 });
}

/**
 * Hash two child nodes together with domain separation
 */
export function hashNodes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const prefixed = new Uint8Array(
    NODE_PREFIX.length + left.length + right.length,
  );
  prefixed.set(NODE_PREFIX, 0);
  prefixed.set(left, NODE_PREFIX.length);
  prefixed.set(right, NODE_PREFIX.length + left.length);
  return blake2b(prefixed, { dkLen: 32 });
}

/**
 * Hash raw data (e.g., video chunk blob) to get chunk hash
 */
export function hashChunk(data: Uint8Array): Uint8Array {
  return blake2b(data, { dkLen: 32 });
}

/**
 * Create an empty Merkle tree
 */
export function createEmptyTree(): MerkleTree {
  return {
    root: new Uint8Array(32), // Zero hash for empty tree
    leaves: [],
    leafCount: 0,
  };
}

/**
 * Compute Merkle root from leaves
 * Uses standard binary tree construction with padding for odd counts
 */
export function computeRoot(leaves: Uint8Array[]): Uint8Array {
  if (leaves.length === 0) {
    return new Uint8Array(32); // Zero hash for empty tree
  }

  if (leaves.length === 1) {
    const first = leaves[0];
    if (!first) return new Uint8Array(32);
    return hashLeaf(first);
  }

  // Hash all leaves first
  let level = leaves.map(hashLeaf);

  // Build tree bottom-up
  while (level.length > 1) {
    const nextLevel: Uint8Array[] = [];

    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1];
      if (left && right) {
        // Two children - hash together
        nextLevel.push(hashNodes(left, right));
      } else if (left) {
        // Odd node - promote to next level (hash with itself)
        nextLevel.push(hashNodes(left, left));
      }
    }

    level = nextLevel;
  }

  return level[0] ?? new Uint8Array(32);
}

/**
 * Add a chunk hash to the tree and return updated tree
 * This is the main function for incremental tree building
 */
export function addLeaf(tree: MerkleTree, chunkHash: Uint8Array): MerkleTree {
  const newLeaves = [...tree.leaves, chunkHash];
  const newRoot = computeRoot(newLeaves);

  return {
    root: newRoot,
    leaves: newLeaves,
    leafCount: newLeaves.length,
  };
}

/**
 * Verify that newRoot is a valid extension of oldRoot
 * (i.e., newTree contains all leaves of oldTree plus additional leaves)
 */
export function verifyExtension(
  oldTree: MerkleTree,
  newTree: MerkleTree,
): boolean {
  // New tree must have at least as many leaves
  if (newTree.leafCount < oldTree.leafCount) {
    return false;
  }

  // All old leaves must be present in same order
  for (let i = 0; i < oldTree.leafCount; i++) {
    const oldLeaf = oldTree.leaves[i];
    const newLeaf = newTree.leaves[i];
    if (!oldLeaf || !newLeaf || !uint8ArrayEquals(oldLeaf, newLeaf)) {
      return false;
    }
  }

  // Verify new root is correctly computed
  const expectedRoot = computeRoot(newTree.leaves);
  return uint8ArrayEquals(newTree.root, expectedRoot);
}

/**
 * Generate a Merkle proof for a specific leaf
 */
export function generateProof(
  tree: MerkleTree,
  leafIndex: number,
): MerkleProof | null {
  if (leafIndex < 0 || leafIndex >= tree.leafCount) {
    return null;
  }

  const siblings: Uint8Array[] = [];
  const directions: ("left" | "right")[] = [];

  // Hash all leaves first
  let level = tree.leaves.map(hashLeaf);
  let index = leafIndex;

  // Walk up the tree collecting siblings
  while (level.length > 1) {
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : index + 1;

    const sibling = level[siblingIndex];
    const current = level[index];
    if (sibling) {
      siblings.push(sibling);
      directions.push(isRight ? "left" : "right");
    } else if (current) {
      // Odd node case - sibling is self
      siblings.push(current);
      directions.push("right");
    }

    // Build next level
    const nextLevel: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1];
      if (left && right) {
        nextLevel.push(hashNodes(left, right));
      } else if (left) {
        nextLevel.push(hashNodes(left, left));
      }
    }

    level = nextLevel;
    index = Math.floor(index / 2);
  }

  const leafHash = tree.leaves[leafIndex];
  if (!leafHash) {
    return null;
  }

  return {
    leafHash,
    leafIndex,
    siblings,
    directions,
  };
}

/**
 * Verify a Merkle proof against a root
 */
export function verifyProof(proof: MerkleProof, root: Uint8Array): boolean {
  let current = hashLeaf(proof.leafHash);

  for (let i = 0; i < proof.siblings.length; i++) {
    const sibling = proof.siblings[i];
    const direction = proof.directions[i];

    if (!sibling) continue;

    if (direction === "left") {
      current = hashNodes(sibling, current);
    } else {
      current = hashNodes(current, sibling);
    }
  }

  return uint8ArrayEquals(current, root);
}

/**
 * Serialize tree to JSON-compatible format for storage
 */
export function serializeTree(tree: MerkleTree): {
  root: string;
  leaves: string[];
  leafCount: number;
} {
  return {
    root: uint8ArrayToHex(tree.root),
    leaves: tree.leaves.map(uint8ArrayToHex),
    leafCount: tree.leafCount,
  };
}

/**
 * Deserialize tree from storage
 */
export function deserializeTree(data: {
  root: string;
  leaves: string[];
  leafCount: number;
}): MerkleTree {
  return {
    root: hexToUint8Array(data.root),
    leaves: data.leaves.map(hexToUint8Array),
    leafCount: data.leafCount,
  };
}

// -----------------------------------------------------------------------------
// Utility functions
// -----------------------------------------------------------------------------

export function uint8ArrayEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function uint8ArrayToHex(arr: Uint8Array): string {
  return (
    "0x" +
    Array.from(arr)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

export function hexToUint8Array(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
