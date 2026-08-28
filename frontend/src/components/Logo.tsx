export default function Logo({ className = '', dark = false }: { className?: string; dark?: boolean }) {
  const textColor = dark ? 'text-[#efeeee]' : 'text-[#191717]';
  return (
    <div className={`font-bold tracking-tighter ${textColor} ${className} flex items-center`}>
      <span>N</span>
      <span className="text-[#026666]">3</span>
      <span>xTime</span>
    </div>
  );
}
