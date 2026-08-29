import { Link } from 'react-router-dom';

export default function DashboardHeader({
  currentPageTitle,
  profileLabel,
  user,
  companySlug,
  displayInitials,
  onLogin,
  companies,
  currentCompanyId,
  onCompanyChange,
}: {
  currentPageTitle: string;
  profileLabel: string;
  user?: { name: string; role: string } | null;
  companySlug?: string;
  displayInitials: string;
  onLogin: () => void;
  companies?: Array<{ companyId: number; name: string }>;
  currentCompanyId?: number;
  onCompanyChange?: (companyId: number) => void;
}) {
  return (
    <header className="border-b border-[#e7e4e4] bg-[#fcfbfb] px-5 py-4 md:px-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#026666]">
            {profileLabel}
          </div>
          <h1 className="mt-1 text-[1.4rem] font-semibold tracking-[-0.03em] text-[#191717]">
            {currentPageTitle}
          </h1>
        </div>

        <div className="flex items-center gap-3 self-start xl:self-auto">
          {companies && companies.length > 1 && onCompanyChange && (
            <select className="field-input h-11 min-w-[190px] py-2" value={currentCompanyId} onChange={(event) => onCompanyChange(Number(event.target.value))}>
              {companies.map((company) => <option key={company.companyId} value={company.companyId}>{company.name}</option>)}
            </select>
          )}
          {user ? (
            <>
              {user.role === 'admin' && companySlug && (
                <Link to={`/${companySlug}/kiosk`} className="btn-secondary hidden sm:inline-flex">
                  Abrir Totem
                </Link>
              )}
              <div className="flex items-center gap-3 rounded-[14px] border border-[#e7e4e4] bg-white px-3 py-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#026666] text-sm font-semibold text-white">
                  {displayInitials}
                </div>
                <div className="text-sm leading-tight">
                  <p className="font-semibold text-[#191717]">{user.name}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#6e6a6a]">{user.role}</p>
                </div>
              </div>
            </>
          ) : (
            <button onClick={onLogin} className="btn-primary">
              Entrar
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
