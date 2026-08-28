import { Link } from 'react-router-dom';
import type { DashboardMobileNavItem } from './dashboardNavigation';

export default function MobileBottomNav({
  items,
  pathname,
}: {
  items: DashboardMobileNavItem[];
  pathname: string;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#d9d7d7] bg-[#fcfbfb]/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-[0_-8px_20px_rgba(25,23,23,0.08)] backdrop-blur lg:hidden">
      <div className="grid grid-cols-4 gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.path || pathname.startsWith(`${item.path}/`);

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center justify-center rounded-[14px] px-2 py-2 text-center transition ${
                isActive ? 'bg-[#edf8f8] text-[#026666]' : 'text-[#6e6a6a] hover:bg-[#f4f8f8] hover:text-[#191717]'
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? 'text-[#026666]' : 'text-[#7d7777]'}`} />
              <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em]">{item.shortName}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
