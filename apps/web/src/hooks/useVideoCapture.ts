/**
 * useVideoCapture Hook
 *
 * Handles continuous video recording with 10-second chunking.
 * Supports mock mode for testing without a real camera.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  addLeaf,
  CHUNK_DURATION_MS,
  createEmptyTree,
  hashChunk,
  type MerkleTree,
  VIDEO_MIME_TYPE,
  type VideoChunk,
} from "../lib/evidence";

// Check env for mock mode
const USE_MOCK =
  import.meta.env.DEV && import.meta.env.VITE_REAL_CAMERA !== "true";

interface UseVideoCaptureOptions {
  /** Trade ID for tagging chunks */
  tradeId: string;
  /** Callback when a new chunk is captured */
  onChunk?: (chunk: VideoChunk, tree: MerkleTree) => void;
  /** Use mock video (default: true in dev without VITE_REAL_CAMERA) */
  useMock?: boolean;
  /** Mock chunk interval in ms (default: 2000 for faster testing) */
  mockIntervalMs?: number;
}

interface UseVideoCaptureReturn {
  /** Whether recording is active */
  isRecording: boolean;
  /** Start recording */
  startRecording: () => Promise<void>;
  /** Stop recording */
  stopRecording: () => void;
  /** Current merkle tree */
  merkleTree: MerkleTree;
  /** All captured chunks */
  chunks: VideoChunk[];
  /** Current chunk count */
  chunkCount: number;
  /** Recording duration in ms */
  durationMs: number;
  /** Any error */
  error: string | null;
  /** Video element ref (for preview) */
  videoRef: React.RefObject<HTMLVideoElement>;
  /** Whether using mock mode */
  isMockMode: boolean;
}

export function useVideoCapture({
  tradeId,
  onChunk,
  useMock = USE_MOCK,
  mockIntervalMs = 2000,
}: UseVideoCaptureOptions): UseVideoCaptureReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [merkleTree, setMerkleTree] = useState<MerkleTree>(createEmptyTree());
  const [chunks, setChunks] = useState<VideoChunk[]>([]);
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mockIntervalRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const chunkStartTimeRef = useRef<number>(0);
  const sequenceRef = useRef<number>(0);

  // Generate a unique chunk ID
  const generateChunkId = useCallback(
    () => `${tradeId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    [tradeId],
  );

  // Refs to avoid race conditions when chunks arrive faster than state updates
  const chunksRef = useRef<VideoChunk[]>([]);
  const merkleTreeRef = useRef<MerkleTree>(createEmptyTree());

  // Process a new chunk (real or mock)
  // Use refs to avoid stale closure state
  const processChunk = useCallback(
    async (blob: Blob) => {
      const arrayBuffer = await blob.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      const hash = hashChunk(data);

      // Read from refs to get latest state
      const prevChunks = chunksRef.current;
      const prevChunk =
        prevChunks.length > 0 ? prevChunks[prevChunks.length - 1] : null;

      const chunk: VideoChunk = {
        id: generateChunkId(),
        tradeId,
        sequenceNumber: sequenceRef.current++,
        blob,
        hash,
        prevChunkHash: prevChunk?.hash ?? null,
        capturedAt: Date.now(),
        durationMs: Date.now() - chunkStartTimeRef.current,
      };

      // Update refs first (synchronous)
      const newTree = addLeaf(merkleTreeRef.current, hash);
      merkleTreeRef.current = newTree;
      chunksRef.current = [...prevChunks, chunk];

      // Then update state for React rendering
      setMerkleTree(newTree);
      setChunks(chunksRef.current);

      // Reset chunk start time
      chunkStartTimeRef.current = Date.now();

      // Callback with accurate tree
      onChunk?.(chunk, newTree);
    },
    [generateChunkId, onChunk, tradeId],
  );

  // Start real recording
  const startRealRecording = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 1280, height: 720 },
        audio: true,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: VIDEO_MIME_TYPE,
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          void processChunk(event.data);
        }
      };

      mediaRecorder.onerror = () => {
        setError("Recording error");
        stopRecording();
      };

      // Start recording with timeslice for chunking
      mediaRecorder.start(CHUNK_DURATION_MS);
      startTimeRef.current = Date.now();
      chunkStartTimeRef.current = Date.now();
      setIsRecording(true);

      // Duration tracker
      durationIntervalRef.current = window.setInterval(() => {
        setDurationMs(Date.now() - startTimeRef.current);
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start camera");
    }
  }, [processChunk]);

  // Start mock recording
  const startMockRecording = useCallback(() => {
    setError(null);
    startTimeRef.current = Date.now();
    chunkStartTimeRef.current = Date.now();
    sequenceRef.current = 0;
    setIsRecording(true);

    // Generate mock chunks on interval
    mockIntervalRef.current = window.setInterval(() => {
      // Create a fake blob with random data
      const fakeData = new Uint8Array(1024);
      crypto.getRandomValues(fakeData);
      const blob = new Blob([fakeData], { type: VIDEO_MIME_TYPE });
      void processChunk(blob);
    }, mockIntervalMs);

    // Duration tracker
    durationIntervalRef.current = window.setInterval(() => {
      setDurationMs(Date.now() - startTimeRef.current);
    }, 100);
  }, [mockIntervalMs, processChunk]);

  // Start recording (dispatches to real or mock)
  const startRecording = useCallback(async () => {
    // Guard against double-start
    if (isRecording) {
      return;
    }

    // Reset state and refs
    const emptyTree = createEmptyTree();
    setMerkleTree(emptyTree);
    setChunks([]);
    setDurationMs(0);
    sequenceRef.current = 0;
    // Also reset refs for race condition fix
    merkleTreeRef.current = emptyTree;
    chunksRef.current = [];

    if (useMock) {
      startMockRecording();
    } else {
      await startRealRecording();
    }
  }, [isRecording, useMock, startMockRecording, startRealRecording]);

  // Stop recording
  const stopRecording = useCallback(() => {
    // Stop mock interval
    if (mockIntervalRef.current) {
      clearInterval(mockIntervalRef.current);
      mockIntervalRef.current = null;
    }

    // Stop duration tracker
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    // Stop media recorder
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    // Stop stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsRecording(false);
  }, []);

  // Cleanup on unmount
  useEffect(
    () => () => {
      stopRecording();
    },
    [stopRecording],
  );

  return {
    isRecording,
    startRecording,
    stopRecording,
    merkleTree,
    chunks,
    chunkCount: chunks.length,
    durationMs,
    error,
    videoRef: videoRef as React.RefObject<HTMLVideoElement>,
    isMockMode: useMock,
  };
}
