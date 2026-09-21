export default function Logo({ className = '', dark = false }: { className?: string; dark?: boolean }) {
  const textColor = dark ? 'text-[#efeeee]' : 'text-[#191717]';
  return (
    <div
      className={`flex cursor-default select-none items-center font-bold tracking-tighter ${textColor} ${className}`}
      role="img"
      aria-label="N3xTime"
    >
      <span>N</span>
      <span className="text-[#026666]">3</span>
      <span>xTime</span>
    </div>
  );
}
