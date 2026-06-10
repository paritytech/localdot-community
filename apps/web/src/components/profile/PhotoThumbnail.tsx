import { useEffect, useRef, useState } from "react";

import { useProfilePhoto } from "../../hooks/useProfilePhoto";

type PhotoSize = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<PhotoSize, string> = {
  sm: "w-6 h-6",
  md: "w-10 h-10",
  lg: "w-14 h-14",
};

const TEXT_CLASSES: Record<PhotoSize, string> = {
  sm: "text-[10px]",
  md: "text-sm",
  lg: "text-lg",
};

interface PhotoThumbnailProps {
  cid?: string | null;
  address: string;
  size?: PhotoSize;
  className?: string;
}

export function PhotoThumbnail({
  cid,
  address,
  size = "md",
  className = "",
}: PhotoThumbnailProps): JSX.Element {
  const { getPhotoUrl } = useProfilePhoto();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!cid) {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      setPhotoUrl(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    getPhotoUrl(cid)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        if (urlRef.current) {
          URL.revokeObjectURL(urlRef.current);
        }
        urlRef.current = url;
        setPhotoUrl(url);
      })
      .catch(() => {
        if (!cancelled) {
          setPhotoUrl(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cid, getPhotoUrl]);

  useEffect(
    () => () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
      }
    },
    [],
  );

  const sizeClass = SIZE_CLASSES[size];
  const textClass = TEXT_CLASSES[size];

  if (loading) {
    return (
      <div
        className={`${sizeClass} rounded-full bg-stone-800 border border-stone-700 animate-pulse ${className}`}
      />
    );
  }

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt="Profile"
        className={`${sizeClass} rounded-full object-cover border border-stone-700 ${className}`}
      />
    );
  }

  const displayChars =
    address.length >= 4 ? address.slice(2, 4).toUpperCase() : "??";

  return (
    <div
      className={`${sizeClass} rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center flex-shrink-0 ${className}`}
    >
      <span className={`mono ${textClass} text-stone-400`}>{displayChars}</span>
    </div>
  );
}
