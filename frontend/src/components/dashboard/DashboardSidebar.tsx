import { useState } from 'react';
import { LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DashboardNavSection } from './dashboardNavigation';
import Logo from '../Logo';

export default function DashboardSidebar({
  navSections,
  pathname,
  user,
  onLogout,
}: {
  navSections: DashboardNavSection[];
  pathname: string;
  user?: { name?: string | null; email?: string | null } | null;
  onLogout: () => void;
}) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const newVal = !prev;
      localStorage.setItem('sidebar_collapsed', String(newVal));
      return newVal;
    });
  };

  const activePath = navSections
    .flatMap((section) => section.items)
    .filter((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]?.path;

  return (
    <aside
      className={`hidden h-screen shrink-0 flex-col overflow-y-auto border-r border-[#252222] bg-[#191717] text-white lg:flex transition-all duration-300 ${
        isCollapsed ? 'w-[88px]' : 'w-[286px]'
      }`}
    >
      <div className={`relative border-b border-[#2b2828] ${isCollapsed ? 'flex flex-col items-center px-4 py-6' : 'px-6 py-6'}`}>
        {!isCollapsed && (
          <button
            onClick={toggleSidebar}
            className="absolute right-4 top-6 text-white/40 transition-colors hover:text-white"
            title="Minimizar menu"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        
        {isCollapsed ? (
          <>
            <button
              onClick={toggleSidebar}
              className="mb-4 text-white/40 transition-colors hover:text-white"
              title="Expandir menu"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <Logo dark className="text-xl" />
          </>
        ) : (
          <>
            <div className="pr-6 flex items-center justify-center py-2">
              <Logo dark className="text-4xl" />
            </div>
          </>
        )}
      </div>

      <nav className={`flex-1 py-5 ${isCollapsed ? 'px-2' : 'px-4'}`}>
        <div className="flex flex-col gap-5">
          {navSections.map((section) => (
            <div key={section.label}>
              {!isCollapsed && (
                <div className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
                  {section.label}
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.path === activePath;

                  return (
                    <Link
                      key={item.name}
                      to={item.path}
                      title={isCollapsed ? item.name : undefined}
                      className={`flex items-center rounded-[12px] text-sm font-medium transition-all ${
                        isCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'
                      } ${
                        isActive
                          ? 'border border-[#026666] bg-[#123737] text-white'
                          : 'border border-transparent text-white/70 hover:border-white/10 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-[#7fdddd]' : 'text-white/45'}`} />
                      {!isCollapsed && <span className="flex-1">{item.name}</span>}
                      {!isCollapsed && isActive && <span className="h-2 w-2 shrink-0 rounded-full bg-[#7fdddd]" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {!isCollapsed ? (
        <div className="mx-4 mb-4 rounded-[14px] border border-white/10 bg-white/5 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">
            Usuário
          </div>
          <div className="mt-3 text-sm font-semibold text-[#efeeee] truncate">{user?.name ?? 'Nao autenticado'}</div>
          <div className="mt-1 text-sm text-white/58 truncate">{user?.email ?? 'sem email'}</div>
        </div>
      ) : (
        <div className="mx-2 mb-4 flex justify-center rounded-[14px] border border-white/10 bg-white/5 p-2" title={user?.name ?? 'Usuário'}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#026666] text-sm font-bold text-white">
            {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
          </div>
        </div>
      )}

      <div className={`border-t border-white/10 ${isCollapsed ? 'p-2' : 'p-4'}`}>
        <button
          onClick={onLogout}
          title={isCollapsed ? 'Sair' : undefined}
          className={`flex w-full items-center rounded-[14px] border border-white/10 text-sm font-medium text-white/72 transition-colors hover:bg-white/5 hover:text-white ${
            isCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'
          }`}
        >
          <LogOut className="h-5 w-5 shrink-0 text-white/48" />
          {!isCollapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
  );
}
