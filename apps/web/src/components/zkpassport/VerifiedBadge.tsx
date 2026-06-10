/**
 * Verified Badge Component
 *
 * Displays a zkpassport verification badge with optional country code.
 */

import { countryToFlag, parseCountryCode } from "../../lib/country";

interface VerifiedBadgeProps {
  /** Country code (e.g., "US", "GB") or undefined if not disclosed */
  countryCode?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Whether to show "Verified" text */
  showText?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function VerifiedBadge({
  countryCode,
  size = "md",
  showText = true,
  className = "",
}: VerifiedBadgeProps): JSX.Element {
  const parsedCountry = parseCountryCode(countryCode);
  const flag = parsedCountry ? countryToFlag(parsedCountry) : null;

  const sizeClasses = {
    sm: {
      container: "h-5 text-xs gap-1 px-1.5",
      icon: "w-3 h-3",
    },
    md: {
      container: "h-6 text-sm gap-1.5 px-2",
      icon: "w-4 h-4",
    },
    lg: {
      container: "h-8 text-base gap-2 px-3",
      icon: "w-5 h-5",
    },
  };

  const styles = sizeClasses[size];

  return (
    <div
      className={`inline-flex items-center rounded-full bg-green-500/10 border border-green-500/20 ${styles.container} ${className}`}
    >
      {/* Checkmark icon */}
      <svg
        className={`${styles.icon} text-green-400 flex-shrink-0`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      >
        <path d="M9 12l2 2 4-4" />
        <circle cx="12" cy="12" r="9" />
      </svg>

      {/* Text */}
      {showText && (
        <span className="text-green-400 font-medium whitespace-nowrap">
          Verified
        </span>
      )}

      {/* Country flag */}
      {flag && (
        <span className="text-inherit" title={parsedCountry}>
          {flag}
        </span>
      )}
    </div>
  );
}

/**
 * Inline verified indicator (just the icon)
 */
export function VerifiedIcon({
  size = "md",
  className = "",
}: Pick<VerifiedBadgeProps, "size" | "className">): JSX.Element {
  const sizeClasses = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  return (
    <svg
      className={`${sizeClasses[size]} text-green-400 ${className}`}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  );
}
