import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

interface EmptyStateAction {
  label: string;
  /** Render as a router Link when set; otherwise renders an onClick button. */
  to?: string;
  onClick?: () => void;
}

interface EmptyStateProps {
  /** Optional lucide icon shown inside the circular badge. */
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  /** Tighter vertical padding for in-tab use; default is page-level. */
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}: EmptyStateProps): JSX.Element {
  const padY = compact ? "py-16" : "py-20";
  return (
    <div
      className={`flex flex-col items-center justify-center px-6 text-center ${padY}`}
    >
      <div className="w-12 h-12 rounded-full bg-stone-800 border-2 border-stone-700 flex items-center justify-center mb-4">
        {Icon ? (
          <Icon className="w-5 h-5 text-stone-500" strokeWidth={1.5} />
        ) : (
          <div className="w-5 h-5 rounded-full border-2 border-stone-600" />
        )}
      </div>
      <p className="text-sm text-stone-400 mb-1">{title}</p>
      {description && (
        <p className="text-xs text-stone-500 max-w-sm">{description}</p>
      )}
      {action && action.to && (
        <Link
          to={action.to}
          className="btn-primary text-sm px-5 py-2 inline-block mt-4"
        >
          {action.label}
        </Link>
      )}
      {action && action.onClick && !action.to && (
        <button onClick={action.onClick} className="btn-primary mt-4">
          {action.label}
        </button>
      )}
    </div>
  );
}
