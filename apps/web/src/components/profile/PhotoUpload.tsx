import { Camera, Pencil, Trash2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useProfilePhoto } from "../../hooks/useProfilePhoto";
import { VALID_MIME_TYPES, validatePhotoFile } from "../../lib/photo";

interface PhotoUploadProps {
  userId: string;
  currentPhotoCid: string | null;
  onPhotoUploaded: (cid: string) => void;
  onPhotoRemoved: () => void;
}

export function PhotoUpload({
  userId,
  currentPhotoCid,
  onPhotoUploaded,
  onPhotoRemoved,
}: PhotoUploadProps): JSX.Element {
  const { upload, getPhotoUrl, isUploading, error, clearError } =
    useProfilePhoto();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<string | null>(null);

  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [croppedFile, setCroppedFile] = useState<File | null>(null);
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const displayError = localError || error;

  useEffect(() => {
    if (!currentPhotoCid) {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      setCurrentPhotoUrl(null);
      return;
    }

    let cancelled = false;
    setPhotoLoading(true);

    getPhotoUrl(currentPhotoCid)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        if (urlRef.current) {
          URL.revokeObjectURL(urlRef.current);
        }
        urlRef.current = url;
        setCurrentPhotoUrl(url);
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentPhotoUrl(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPhotoLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentPhotoCid, getPhotoUrl]);

  useEffect(
    () => () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
      }
    },
    [],
  );

  const handleFileSelect = useCallback(
    (file: File) => {
      clearError();
      setLocalError(null);

      const validationError = validatePhotoFile(file);
      if (validationError) {
        setLocalError(validationError);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result !== "string") {
          setLocalError("Failed to read file");
          return;
        }
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const size = Math.min(img.width, img.height);
          canvas.width = size;
          canvas.height = size;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            setLocalError("Failed to process image");
            return;
          }

          const sx = (img.width - size) / 2;
          const sy = (img.height - size) / 2;
          ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                setLocalError("Failed to crop image");
                return;
              }
              setCroppedFile(new File([blob], file.name, { type: file.type }));
              setPreview(canvas.toDataURL(file.type));
            },
            file.type,
            0.9,
          );
        };
        img.src = result;
      };
      reader.readAsDataURL(file);
    },
    [clearError],
  );

  const handleUpload = useCallback(async () => {
    if (!croppedFile) return;
    try {
      const cid = await upload(croppedFile, userId);
      onPhotoUploaded(cid);
      setPreview(null);
      setCroppedFile(null);
    } catch {
      // Error handled by hook
    }
  }, [croppedFile, upload, userId, onPhotoUploaded]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect],
  );

  const cancelPreview = useCallback(() => {
    setPreview(null);
    setCroppedFile(null);
    setLocalError(null);
    clearError();
  }, [clearError]);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept={VALID_MIME_TYPES.join(",")}
      onChange={handleInputChange}
      className="hidden"
    />
  );

  if (preview) {
    return (
      <div className="space-y-3">
        <div className="relative w-14 h-14">
          <img
            src={preview}
            alt="Preview"
            className="w-full h-full rounded-full object-cover border-2 border-stone-600"
          />
          <button
            onClick={cancelPreview}
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-stone-800 border border-stone-600 flex items-center justify-center hover:bg-stone-700 transition-colors"
            aria-label="Cancel"
          >
            <X className="w-2.5 h-2.5 text-stone-400" />
          </button>
        </div>
        {displayError && <p className="text-xs text-red-400">{displayError}</p>}
        <div className="flex gap-2">
          <button
            onClick={cancelPreview}
            className="btn-ghost text-xs py-1 px-2"
            disabled={isUploading}
          >
            Cancel
          </button>
          <button
            onClick={() => void handleUpload()}
            className="btn-primary text-xs py-1 px-2 flex items-center gap-1"
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Upload className="w-3 h-3" />
                Save
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (currentPhotoUrl) {
    return (
      <div className="space-y-2">
        <div
          className="relative w-14 h-14 group cursor-pointer"
          onClick={openFilePicker}
        >
          <img
            src={currentPhotoUrl}
            alt="Profile"
            className="w-full h-full rounded-full object-cover border-2 border-stone-700"
          />
          <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Pencil className="w-4 h-4 text-white" />
          </div>
          {fileInput}
        </div>
        <button
          onClick={onPhotoRemoved}
          className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 transition-colors"
        >
          <Trash2 className="w-2.5 h-2.5" />
          Remove
        </button>
        {displayError && <p className="text-xs text-red-400">{displayError}</p>}
      </div>
    );
  }

  if (photoLoading) {
    return (
      <div className="w-14 h-14 rounded-full bg-stone-800 border-2 border-stone-700 animate-pulse" />
    );
  }

  return (
    <div className="space-y-2">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onClick={openFilePicker}
        className={`relative w-14 h-14 rounded-full border-2 border-dashed cursor-pointer transition-colors flex items-center justify-center ${
          dragOver
            ? "border-amber-400 bg-amber-500/10"
            : "border-stone-600 hover:border-stone-500 bg-stone-800"
        }`}
      >
        <Camera className="w-5 h-5 text-stone-500" />
        {fileInput}
      </div>
      <p className="text-[11px] text-stone-500">Add photo</p>
      {displayError && <p className="text-xs text-red-400">{displayError}</p>}
    </div>
  );
}
