export function InfoRow({
  label,
  value,
  mono: isMono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): JSX.Element {
  return (
    <div>
      <p className="text-[11px] text-stone-500">{label}</p>
      <p className={`text-sm text-stone-200 ${isMono ? "mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}
