import { ExternalLink } from "lucide-react";

/**
 * Open a lat/lon pair on Google Maps. Sandboxed hosts (Polkadot Triangle iframes)
 * often swallow `target="_blank"` — we call `window.open` manually as a fallback
 * and stop propagation so a parent Leaflet map doesn't pan from the click.
 */
export function OpenInMapsLink({
  lat,
  lon,
  variant = "overlay",
  className = "",
}: {
  lat: number;
  lon: number;
  /** "overlay" sits over a map; "inline" is a small text link inside cards. */
  variant?: "overlay" | "inline";
  className?: string;
}): JSX.Element {
  const url = `https://www.google.com/maps?q=${lat},${lon}`;
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.stopPropagation();
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (win) e.preventDefault();
  };

  if (variant === "inline") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className={
          className ||
          "inline-block text-xs text-stone-300 hover:text-stone-100"
        }
      >
        Open in Maps →
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={
        className ||
        "absolute bottom-3 right-3 z-[1000] pointer-events-auto inline-flex items-center gap-1.5 bg-stone-950/85 backdrop-blur px-3 py-1.5 rounded-lg text-xs text-stone-200 hover:bg-stone-950 transition-colors"
      }
    >
      <ExternalLink className="w-3 h-3" />
      Open in Maps
    </a>
  );
}
