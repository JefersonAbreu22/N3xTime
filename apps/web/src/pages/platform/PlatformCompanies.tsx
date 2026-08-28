import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Building2, ExternalLink, LayoutDashboard, Plus, RefreshCw, ShieldAlert, Users, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import DashboardHeader from '../../components/dashboard/DashboardHeader';
import DashboardSidebar from '../../components/dashboard/DashboardSidebar';
import { getDisplayInitials, type DashboardNavSection } from '../../components/dashboard/dashboardNavigation';
import { platformApi, type PlatformCompany, type ProvisionCompanyPayload } from '../../services/platformApi';
import { lookupCnpj } from '../../services/cnpjApi';
import { usePlatformAuthStore } from '../../stores/platformAuthStore';
import { useAuthStore } from '../../stores/authStore';

const emptyForm: ProvisionCompanyPayload = {
  legal_name: '', trade_name: '', slug: '', cnpj: '', email: '', phone: '',
  address_line: '', city: '', state: '', zip_code: '', kiosk_access_key: '',
  admin: { name: '', email: '', password: '', cpf: '', registration_number: '' },
};

const statusLabel = { active: 'Ativa', inactive: 'Inativa', suspended: 'Suspensa' };
const statusClass = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  inactive: 'border-slate-200 bg-slate-50 text-slate-600',
  suspended: 'border-red-200 bg-red-50 text-red-700',
};

export default function PlatformCompanies({ embedded = false }: { embedded?: boolean }) {
  const [companies, setCompanies] = useState<PlatformCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchingCnpj, setFetchingCnpj] = useState(false);
  const [accessingCompanyId, setAccessingCompanyId] = useState<number | null>(null);
  const [form, setForm] = useState<ProvisionCompanyPayload>(emptyForm);
  const user = usePlatformAuthStore((state) => state.user);
  const clearSession = usePlatformAuthStore((state) => state.clearSession);
  const beginImpersonation = useAuthStore((state) => state.beginImpersonation);
  const clearAuthSession = useAuthStore((state) => state.clearSession);
  const navigate = useNavigate();
  const location = useLocation();

  const navSections = useMemo<DashboardNavSection[]>(() => [
    {
      label: 'Plataforma',
      items: [{ name: 'Empresas', path: '/platform/companies', icon: Building2 }],
    },
    {
      label: 'Navegação',
      items: [{ name: 'Voltar ao Dashboard', path: '/dashboard', icon: LayoutDashboard }],
    },
  ], []);

  const logout = () => {
    clearSession();
    clearAuthSession();
    navigate('/login');
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const response = await platformApi.listCompanies();
      setCompanies(response.data);
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } }).response?.status;
      if (status === 401 || status === 403) {
        clearSession();
        clearAuthSession();
        navigate('/login');
      } else toast.error('Não foi possível carregar as empresas.');
    } finally {
      setLoading(false);
    }
  }, [clearAuthSession, clearSession, navigate]);

  useEffect(() => { void load(); }, [load]);

  const metrics = useMemo(() => ({
    total: companies.length,
    active: companies.filter((company) => company.status === 'active').length,
    suspended: companies.filter((company) => company.status !== 'active').length,
    users: companies.reduce((sum, company) => sum + company.users_count, 0),
  }), [companies]);
  const metricCards: Array<{ label: string; value: number; icon: LucideIcon }> = [
    { label: 'Empresas', value: metrics.total, icon: Building2 },
    { label: 'Ativas', value: metrics.active, icon: Building2 },
    { label: 'Bloqueadas', value: metrics.suspended, icon: ShieldAlert },
    { label: 'Usuários', value: metrics.users, icon: Users },
  ];

  const setField = (field: keyof Omit<ProvisionCompanyPayload, 'admin'>, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));
  const setAdminField = (field: keyof ProvisionCompanyPayload['admin'], value: string) =>
    setForm((current) => ({ ...current, admin: { ...current.admin, [field]: value } }));
  const generateKioskKey = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    const key = `n3x_${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`;
    setField('kiosk_access_key', key);
  };

  const fetchCnpj = async () => {
    const cleanCnpj = (form.cnpj || '').replace(/\D/g, '');
    if (cleanCnpj.length !== 14) {
      toast.error('CNPJ inválido. Digite 14 números.');
      return;
    }

    try {
      setFetchingCnpj(true);
      toast.loading('Buscando CNPJ...', { id: 'platform-cnpj-fetch' });
      const data = await lookupCnpj(cleanCnpj);
      setForm((current) => {
        const companyName = data.tradeName || data.legalName;
        const suggestedSlug = companyName
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 80);

        return {
          ...current,
          legal_name: data.legalName || current.legal_name,
          trade_name: data.tradeName || current.trade_name,
          slug: current.slug || suggestedSlug,
          email: data.email || current.email,
          phone: data.phone || current.phone,
          address_line: data.addressLine || current.address_line,
          city: data.city || current.city,
          state: data.state || current.state,
          zip_code: data.zipCode || current.zip_code,
        };
      });
      toast.success('Dados do CNPJ importados com sucesso!', { id: 'platform-cnpj-fetch' });
    } catch {
      toast.error('Erro ao buscar CNPJ. Verifique se o número está correto.', { id: 'platform-cnpj-fetch' });
    } finally {
      setFetchingCnpj(false);
    }
  };

  const provision = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setSaving(true);
      await platformApi.provisionCompany(form);
      toast.success('Empresa provisionada com sucesso.');
      setShowForm(false);
      setForm(emptyForm);
      await load();
    } catch (error: unknown) {
      toast.error((error as { response?: { data?: { error?: string } } }).response?.data?.error || 'Não foi possível provisionar a empresa.');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (company: PlatformCompany, status: PlatformCompany['status']) => {
    const reason = window.prompt(`Informe o motivo para deixar ${company.legal_name} como ${statusLabel[status].toLowerCase()}:`);
    if (!reason?.trim()) return;
    try {
      await platformApi.updateCompanyStatus(company.id, status, reason.trim());
      toast.success('Status atualizado.');
      await load();
    } catch (error: unknown) {
      toast.error((error as { response?: { data?: { error?: string } } }).response?.data?.error || 'Erro ao atualizar status.');
    }
  };

  const accessCompany = async (company: PlatformCompany) => {
    try {
      setAccessingCompanyId(company.id);
      const response = await platformApi.accessCompany(company.id);
      beginImpersonation(response.data.token, response.data.user);
      toast.success(`Acessando o ambiente de ${company.trade_name || company.legal_name}.`);
      navigate('/dashboard');
    } catch (error: unknown) {
      toast.error((error as { response?: { data?: { error?: string } } }).response?.data?.error || 'Não foi possível acessar a empresa.');
    } finally {
      setAccessingCompanyId(null);
    }
  };

  return (
    <div className={embedded ? 'contents' : 'app-shell flex h-screen overflow-hidden'}>
      {!embedded && <DashboardSidebar
        navSections={navSections}
        pathname={location.pathname}
        user={user}
        onLogout={logout}
      />}

      <div className={embedded ? 'contents' : 'flex min-w-0 flex-1 flex-col'}>
        {!embedded && <DashboardHeader
          currentPageTitle="Empresas"
          profileLabel="Super Admin"
          user={user ? { name: user.name, role: 'platform_admin' } : null}
          displayInitials={user ? getDisplayInitials(user.name) : ''}
          onLogin={() => navigate('/login')}
        />}

        <main className={embedded ? 'contents' : 'min-h-0 flex-1 overflow-y-auto p-4 pb-24 md:p-5 md:pb-24 xl:p-6 xl:pb-6'}>
          <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div><div className="text-xs font-bold uppercase tracking-[0.16em] text-[#026666]">Empresas</div><h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">Ambientes da plataforma</h1><p className="mt-2 text-sm text-[#6e6a6a]">Provisionamento, disponibilidade e volume de usuários por tenant.</p></div>
          <div className="flex flex-wrap gap-3"><button className="btn-secondary" onClick={() => void load()}><RefreshCw className="h-4 w-4" />Atualizar</button><button className="btn-primary" onClick={() => setShowForm(true)}><Plus className="h-4 w-4" />Nova empresa</button></div>
        </div>

        <section className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {metricCards.map(({ label, value, icon: Icon }) => (
            <div className="metric-card" key={label}><div className="flex items-center justify-between"><span className="metric-label">{label}</span><Icon className="h-4 w-4 text-[#026666]" /></div><div className="metric-value">{value}</div></div>
          ))}
        </section>

        <section className="surface-panel mt-6 overflow-hidden">
          {loading ? <div className="p-10 text-center text-sm text-[#6e6a6a]">Carregando empresas...</div> : companies.length === 0 ? <div className="p-10 text-center text-sm text-[#6e6a6a]">Nenhuma empresa cadastrada.</div> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-[#f7f5f5] text-[10px] uppercase tracking-[0.13em] text-[#6e6a6a]"><tr><th className="px-5 py-3">Empresa</th><th className="px-5 py-3">Identificador</th><th className="px-5 py-3">CNPJ</th><th className="px-5 py-3">Usuários</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Ação</th></tr></thead><tbody>
              {companies.map((company) => <tr key={company.id} className="border-t border-[#ebe8e8]"><td className="px-5 py-4"><div className="flex items-center gap-2"><span className="font-semibold">{company.trade_name || company.legal_name}</span>{company.is_primary && <span className="status-chip border-[#b9dede] bg-[#e4f4f4] text-[#026666]">Empresa principal</span>}</div><div className="mt-1 text-xs text-[#777]">{company.legal_name}</div></td><td className="px-5 py-4 font-mono text-xs">{company.slug}</td><td className="px-5 py-4 text-[#6e6a6a]">{company.cnpj || '—'}</td><td className="px-5 py-4">{company.users_count}</td><td className="px-5 py-4"><span className={`status-chip ${statusClass[company.status]}`}>{statusLabel[company.status]}</span></td><td className="px-5 py-4"><div className="flex items-center justify-end gap-3">{company.status === 'active' && <a className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#026666] hover:underline" href={`/${company.slug}/kiosk`} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" />Abrir totem</a>}{company.status === 'active' && <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#026666] hover:underline disabled:opacity-50" disabled={accessingCompanyId === company.id} onClick={() => void accessCompany(company)}><ExternalLink className="h-3.5 w-3.5" />{accessingCompanyId === company.id ? 'Acessando...' : 'Acessar empresa'}</button>}{company.is_primary ? <span className="text-xs font-semibold text-[#6e6a6a]" title="A empresa principal deve permanecer ativa">Protegida</span> : company.status === 'active' ? <button className="text-xs font-semibold text-red-700 hover:underline" onClick={() => void changeStatus(company, 'suspended')}>Suspender</button> : <button className="text-xs font-semibold text-[#026666] hover:underline" onClick={() => void changeStatus(company, 'active')}>Reativar</button>}</div></td></tr>)}
            </tbody></table></div>
          )}
        </section>
          </div>
        </main>
      </div>

      {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"><div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-[#fcfbfb] shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#ebe8e8] bg-[#fcfbfb] px-6 py-5"><div><h2 className="text-xl font-semibold">Provisionar empresa</h2><p className="mt-1 text-xs text-[#6e6a6a]">O ambiente, admin e quiosque serão criados na mesma transação.</p></div><button className="btn-ghost" onClick={() => setShowForm(false)}><X className="h-5 w-5" /></button></div>
        <form className="p-6" onSubmit={provision}>
          <h3 className="text-sm font-semibold">Dados da empresa</h3><div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Razão social" value={form.legal_name} onChange={(value) => setField('legal_name', value)} required />
            <Field label="Nome fantasia" value={form.trade_name || ''} onChange={(value) => setField('trade_name', value)} />
            <Field label="Identificador (slug)" value={form.slug} onChange={(value) => setField('slug', value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} required placeholder="empresa-exemplo" />
            <label className="block">
              <span className="mb-1.5 flex items-center justify-between">
                <span className="field-label mb-0">CNPJ</span>
                <button type="button" className="text-xs font-semibold text-[#026666] hover:text-[#014444] disabled:opacity-50" onClick={() => void fetchCnpj()} disabled={fetchingCnpj}>
                  {fetchingCnpj ? 'Buscando...' : 'Buscar dados'}
                </button>
              </span>
              <input className="field-input" value={form.cnpj || ''} onChange={(event) => setField('cnpj', event.target.value)} placeholder="00.000.000/0000-00" />
            </label>
            <Field label="E-mail corporativo" type="email" value={form.email || ''} onChange={(value) => setField('email', value)} />
            <Field label="Telefone" value={form.phone || ''} onChange={(value) => setField('phone', value)} />
            <Field label="Endereço" value={form.address_line || ''} onChange={(value) => setField('address_line', value)} />
            <Field label="CEP" value={form.zip_code || ''} onChange={(value) => setField('zip_code', value)} />
            <Field label="Cidade" value={form.city || ''} onChange={(value) => setField('city', value)} />
            <Field label="Estado" value={form.state || ''} onChange={(value) => setField('state', value)} />
          </div>
          <h3 className="mt-7 text-sm font-semibold">Administrador da empresa</h3><div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Nome" value={form.admin.name} onChange={(value) => setAdminField('name', value)} required />
            <Field label="E-mail" type="email" value={form.admin.email} onChange={(value) => setAdminField('email', value)} required />
            <Field label="CPF" value={form.admin.cpf} onChange={(value) => setAdminField('cpf', value)} required />
            <Field label="Matrícula" value={form.admin.registration_number} onChange={(value) => setAdminField('registration_number', value)} required />
            <Field label="Senha temporária" type="password" value={form.admin.password} onChange={(value) => setAdminField('password', value)} required />
            <label className="block"><span className="flex items-center justify-between"><span className="field-label">Chave do quiosque</span><button type="button" className="mb-1.5 text-xs font-semibold text-[#026666] hover:underline" onClick={generateKioskKey}>Gerar chave segura</button></span><input className="field-input" type="text" value={form.kiosk_access_key} onChange={(event) => setField('kiosk_access_key', event.target.value)} required /></label>
          </div><p className="mt-3 text-xs text-[#6e6a6a]">A senha deve ter pelo menos 8 caracteres, com maiúscula, minúscula, número e símbolo. O administrador deverá trocá-la no primeiro acesso.</p>
          <div className="mt-7 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button><button className="btn-primary" disabled={saving}>{saving ? 'Provisionando...' : 'Criar empresa'}</button></div>
        </form></div></div>}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required = false, placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; placeholder?: string }) {
  return <label className="block"><span className="field-label">{label}</span><input className="field-input" type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} placeholder={placeholder} /></label>;
}
