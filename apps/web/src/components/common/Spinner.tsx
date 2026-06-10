interface SpinnerProps {
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Whether to include padding wrapper */
  inline?: boolean;
}

export function Spinner({
  size = "md",
  inline = false,
}: SpinnerProps): JSX.Element {
  const sizeClasses = {
    sm: "h-4 w-4 border-2",
    md: "h-5 w-5 border-2",
    lg: "h-8 w-8 border-3",
  };

  const spinner = (
    <div
      className={`${sizeClasses[size]} border-stone-700 border-t-stone-400 rounded-full animate-spin`}
    />
  );

  if (inline) {
    return spinner;
  }

  return (
    <div className="flex items-center justify-center py-24">{spinner}</div>
  );
}
