export function TabButton({
  active,
  count,
  countColor,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  countColor: string;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      className={`px-4 py-3 text-sm font-medium transition-colors relative ${active ? "text-stone-100" : "text-stone-500 hover:text-stone-300"}`}
      onClick={onClick}
    >
      {children}
      {count > 0 && (
        <span
          className={`ml-2 mono text-[11px] px-1.5 py-0.5 rounded-full ${countColor}`}
        >
          {count}
        </span>
      )}
      {active && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-stone-100" />
      )}
    </button>
  );
}
