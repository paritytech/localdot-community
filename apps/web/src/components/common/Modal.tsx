import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

export function Modal({
  isOpen,
  onClose,
  children,
  size = "md",
}: ModalProps): React.ReactPortal | null {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: "max-w-md",
    md: "max-w-2xl",
    lg: "max-w-4xl",
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl w-full ${sizeClasses[size]} max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

interface ModalHeaderProps {
  children: React.ReactNode;
  onClose: () => void;
}

export function ModalHeader({
  children,
  onClose,
}: ModalHeaderProps): JSX.Element {
  return (
    <div className="sticky top-0 z-10 bg-stone-900 border-b border-stone-800 px-6 py-4 flex items-start justify-between">
      <div className="flex-1">{children}</div>
      <button
        onClick={onClose}
        className="ml-4 p-1 text-stone-400 hover:text-stone-200 transition-colors"
        aria-label="Close modal"
      >
        <X size={20} strokeWidth={2} />
      </button>
    </div>
  );
}

interface ModalBodyProps {
  children: React.ReactNode;
}

export function ModalBody({ children }: ModalBodyProps): JSX.Element {
  return <div className="px-6 py-6">{children}</div>;
}

interface ModalFooterProps {
  children: React.ReactNode;
}

export function ModalFooter({ children }: ModalFooterProps): JSX.Element {
  return (
    <div className="sticky bottom-0 bg-stone-900 border-t border-stone-800 px-6 py-4">
      {children}
    </div>
  );
}
