import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Building2,
  CirclePause,
  CirclePlay,
  DatabaseBackup,
  ExternalLink,
  LayoutDashboard,
  LoaderCircle,
  LogIn,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Upload,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import DashboardHeader from '../../components/dashboard/DashboardHeader';
import DashboardSidebar from '../../components/dashboard/DashboardSidebar';
import { getDisplayInitials, type DashboardNavSection } from '../../components/dashboard/dashboardNavigation';
import {
  platformApi,
  type CompanyAdmin,
  type CompanyAdminPayload,
  type CompanyDetailsPayload,
  type PlatformCompany,
  type ProvisionCompanyPayload,
} from '../../services/platformApi';
import { lookupCnpj } from '../../services/cnpjApi';
import { usePlatformAuthStore } from '../../stores/platformAuthStore';
import { useAuthStore } from '../../stores/authStore';

type CompanyFormState = CompanyDetailsPayload & { kiosk_access_key: string };
type AdminFormState = CompanyAdminPayload & { status: 'active' | 'inactive' };

const emptyCompanyForm: CompanyFormState = {
  legal_name: '',
  trade_name: '',
  slug: '',
  cnpj: '',
  email: '',
  phone: '',
  address_line: '',
  city: '',
  state: '',
  zip_code: '',
  kiosk_access_key: '',
};

const emptyAdminForm: AdminFormState = {
  name: '',
  email: '',
  password: '',
  cpf: '',
  registration_number: '',
  status: 'active',
};

const statusLabel = { active: 'Ativa', inactive: 'Inativa', suspended: 'Suspensa' };
const statusClass = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  inactive: 'border-slate-200 bg-slate-50 text-slate-600',
  suspended: 'border-red-200 bg-red-50 text-red-700',
};

const companyToForm = (company: PlatformCompany): CompanyFormState => ({
  legal_name: company.legal_name,
  trade_name: company.trade_name ?? '',
  slug: company.slug,
  cnpj: company.cnpj ?? '',
  email: company.email ?? '',
  phone: company.phone ?? '',
  address_line: company.address_line ?? '',
  city: company.city ?? '',
  state: company.state ?? '',
  zip_code: company.zip_code ?? '',
  kiosk_access_key: '',
});

const adminToForm = (admin: CompanyAdmin): AdminFormState => ({
  name: admin.name,
  email: admin.email,
  password: '',
  cpf: admin.cpf,
  registration_number: admin.registration_number,
  status: admin.status,
});

const getApiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } }).response?.data?.error || fallback;

export default function PlatformCompanies({ embedded = false }: { embedded?: boolean }) {
  const [companies, setCompanies] = useState<PlatformCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCompany, setSavingCompany] = useState(false);
  const [fetchingCnpj, setFetchingCnpj] = useState(false);
  const [editingCompany, setEditingCompany] = useState<PlatformCompany | null | undefined>(undefined);
  const [companyForm, setCompanyForm] = useState<CompanyFormState>(emptyCompanyForm);
  const [adminCompany, setAdminCompany] = useState<PlatformCompany | null>(null);
  const [admins, setAdmins] = useState<CompanyAdmin[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<CompanyAdmin | null>(null);
  const [adminForm, setAdminForm] = useState<AdminFormState>(emptyAdminForm);
  const [accessingCompanyId, setAccessingCompanyId] = useState<number | null>(null);
  const [transferCompany, setTransferCompany] = useState<PlatformCompany | null>(null);
  const [transferring, setTransferring] = useState(false);
  const dumpInputRef = useRef<HTMLInputElement | null>(null);
  const user = usePlatformAuthStore((state) => state.user);
  const clearSession = usePlatformAuthStore((state) => state.clearSession);
  const beginImpersonation = useAuthStore((state) => state.beginImpersonation);
  const clearAuthSession = useAuthStore((state) => state.clearSession);
  const navigate = useNavigate();
  const location = useLocation();

  const navSections = useMemo<DashboardNavSection[]>(() => [
    { label: 'Plataforma', items: [{ name: 'Empresas', path: '/platform/companies', icon: Building2 }] },
    { label: 'Navegação', items: [{ name: 'Voltar ao Dashboard', path: '/dashboard', icon: LayoutDashboard }] },
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
      } else {
        toast.error('Não foi possível carregar as empresas.');
      }
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

  const setCompanyField = (field: keyof CompanyFormState, value: string) =>
    setCompanyForm((current) => ({ ...current, [field]: value }));

  const setAdminField = (field: keyof AdminFormState, value: string) =>
    setAdminForm((current) => ({ ...current, [field]: value }));

  const openNewCompany = () => {
    setCompanyForm(emptyCompanyForm);
    setEditingCompany(null);
  };

  const openEditCompany = (company: PlatformCompany) => {
    setCompanyForm(companyToForm(company));
    setEditingCompany(company);
  };

  const closeCompanyModal = () => {
    setEditingCompany(undefined);
    setCompanyForm(emptyCompanyForm);
  };

  const generateKioskKey = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    const key = `n3x_${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`;
    setCompanyField('kiosk_access_key', key);
  };

  const fetchCnpj = async () => {
    const cleanCnpj = (companyForm.cnpj || '').replace(/\D/g, '');
    if (cleanCnpj.length !== 14) {
      toast.error('CNPJ inválido. Digite 14 números.');
      return;
    }

    try {
      setFetchingCnpj(true);
      toast.loading('Buscando CNPJ...', { id: 'platform-cnpj-fetch' });
      const data = await lookupCnpj(cleanCnpj);
      setCompanyForm((current) => {
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

  const saveCompany = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setSavingCompany(true);
      const { kiosk_access_key, ...details } = companyForm;
      if (editingCompany) {
        await platformApi.updateCompany(editingCompany.id, details);
        toast.success('Empresa atualizada com sucesso.');
      } else {
        await platformApi.provisionCompany({ ...details, kiosk_access_key } as ProvisionCompanyPayload);
        toast.success('Empresa criada. Importe o dump ou cadastre um administrador.');
      }
      closeCompanyModal();
      await load();
    } catch (error: unknown) {
      toast.error(getApiError(error, editingCompany ? 'Não foi possível atualizar a empresa.' : 'Não foi possível criar a empresa.'));
    } finally {
      setSavingCompany(false);
    }
  };

  const loadAdmins = useCallback(async (companyId: number) => {
    try {
      setLoadingAdmins(true);
      const response = await platformApi.listCompanyAdmins(companyId);
      setAdmins(response.data);
    } catch (error: unknown) {
      toast.error(getApiError(error, 'Não foi possível carregar os administradores.'));
    } finally {
      setLoadingAdmins(false);
    }
  }, []);

  const openAdmins = async (company: PlatformCompany) => {
    setAdminCompany(company);
    setEditingAdmin(null);
    setAdminForm(emptyAdminForm);
    await loadAdmins(company.id);
  };

  const closeAdmins = () => {
    setAdminCompany(null);
    setAdmins([]);
    setEditingAdmin(null);
    setAdminForm(emptyAdminForm);
  };

  const startEditingAdmin = (admin: CompanyAdmin) => {
    setEditingAdmin(admin);
    setAdminForm(adminToForm(admin));
  };

  const resetAdminForm = () => {
    setEditingAdmin(null);
    setAdminForm(emptyAdminForm);
  };

  const saveAdmin = async (event: FormEvent) => {
    event.preventDefault();
    if (!adminCompany) return;
    try {
      setSavingAdmin(true);
      const response = editingAdmin
        ? await platformApi.updateCompanyAdmin(adminCompany.id, editingAdmin.id, adminForm)
        : await platformApi.createCompanyAdmin(adminCompany.id, {
          name: adminForm.name,
          email: adminForm.email,
          password: adminForm.password,
          cpf: adminForm.cpf,
          registration_number: adminForm.registration_number,
        });
      toast.success(response.message);
      resetAdminForm();
      await Promise.all([loadAdmins(adminCompany.id), load()]);
    } catch (error: unknown) {
      toast.error(getApiError(error, 'Não foi possível salvar o administrador.'));
    } finally {
      setSavingAdmin(false);
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
      toast.error(getApiError(error, 'Erro ao atualizar status.'));
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
      toast.error(getApiError(error, 'Não foi possível acessar a empresa.'));
    } finally {
      setAccessingCompanyId(null);
    }
  };

  const backupCompany = async (company: PlatformCompany) => {
    try {
      setTransferring(true);
      const blob = await platformApi.backupCompany(company.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `n3xtime-${company.slug}-${new Date().toISOString().slice(0, 10)}.sql`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('Backup do tenant gerado.');
    } catch {
      toast.error('Não foi possível gerar o backup.');
    } finally {
      setTransferring(false);
    }
  };

  const chooseDump = (company: PlatformCompany) => {
    setTransferCompany(company);
    dumpInputRef.current?.click();
  };

  const importDump = async (file?: File) => {
    if (!file || !transferCompany) return;
    if (!window.confirm(`Importar ${file.name} em ${transferCompany.trade_name || transferCompany.legal_name}? Os dados atuais deste tenant serão substituídos.`)) return;
    try {
      setTransferring(true);
      await platformApi.importCompany(transferCompany.id, file, true);
      toast.success('Dump importado com sucesso.');
      await load();
    } catch (error: unknown) {
      toast.error(getApiError(error, 'Falha na importação do dump.'));
    } finally {
      setTransferring(false);
      setTransferCompany(null);
      if (dumpInputRef.current) dumpInputRef.current.value = '';
    }
  };

  return (
    <div className={embedded ? 'contents' : 'app-shell flex h-screen overflow-hidden'}>
      {!embedded && (
        <DashboardSidebar navSections={navSections} pathname={location.pathname} user={user} onLogout={logout} />
      )}

      <div className={embedded ? 'contents' : 'flex min-w-0 flex-1 flex-col'}>
        {!embedded && (
          <DashboardHeader
            currentPageTitle="Empresas"
            profileLabel="Super Admin"
            user={user ? { name: user.name, role: 'platform_admin' } : null}
            displayInitials={user ? getDisplayInitials(user.name) : ''}
            onLogin={() => navigate('/login')}
          />
        )}

        <main className={embedded ? 'contents' : 'min-h-0 flex-1 overflow-y-auto p-4 pb-24 md:p-5 md:pb-24 xl:p-6 xl:pb-6'}>
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-[#026666]">Empresas</div>
                <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">Ambientes da plataforma</h1>
                <p className="mt-2 text-sm text-[#6e6a6a]">Provisionamento, administradores, disponibilidade e volume de usuários por tenant.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button className="btn-secondary" onClick={() => void load()}><RefreshCw className="h-4 w-4" />Atualizar</button>
                <button className="btn-primary" onClick={openNewCompany}><Plus className="h-4 w-4" />Nova empresa</button>
              </div>
            </div>

            <section className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {metricCards.map(({ label, value, icon: Icon }) => (
                <div className="metric-card" key={label}>
                  <div className="flex items-center justify-between"><span className="metric-label">{label}</span><Icon className="h-4 w-4 text-[#026666]" /></div>
                  <div className="metric-value">{value}</div>
                </div>
              ))}
            </section>

            <input ref={dumpInputRef} type="file" accept=".sql,application/sql,text/plain" className="hidden" onChange={(event) => void importDump(event.target.files?.[0])} />

            <section className="surface-panel mt-6 overflow-hidden">
              {loading ? (
                <div className="p-10 text-center text-sm text-[#6e6a6a]">Carregando empresas...</div>
              ) : companies.length === 0 ? (
                <div className="p-10 text-center text-sm text-[#6e6a6a]">Nenhuma empresa cadastrada.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead className="bg-[#f7f5f5] text-[10px] uppercase tracking-[0.13em] text-[#6e6a6a]">
                      <tr>
                        <th className="px-5 py-3">Empresa</th>
                        <th className="px-5 py-3">Identificador</th>
                        <th className="px-5 py-3">CNPJ</th>
                        <th className="px-5 py-3">Usuários</th>
                        <th className="px-5 py-3">Admins</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {companies.map((company) => (
                        <tr key={company.id} className="border-t border-[#ebe8e8]">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{company.trade_name || company.legal_name}</span>
                              {company.is_primary && <span className="status-chip border-[#b9dede] bg-[#e4f4f4] text-[#026666]">Principal</span>}
                            </div>
                            <div className="mt-1 text-xs text-[#777]">{company.legal_name}</div>
                          </td>
                          <td className="px-5 py-4 font-mono text-xs">{company.slug}</td>
                          <td className="px-5 py-4 text-[#6e6a6a]">{company.cnpj || '—'}</td>
                          <td className="px-5 py-4">{company.users_count}</td>
                          <td className="px-5 py-4">
                            <span className={`status-chip ${company.active_admins_count ? 'border-[#dceaea] bg-[#edf8f8] text-[#026666]' : 'border-[#f0dede] bg-[#fbf1f1] text-[#b43737]'}`}>
                              {company.active_admins_count} ativo(s)
                            </span>
                          </td>
                          <td className="px-5 py-4"><span className={`status-chip ${statusClass[company.status]}`}>{statusLabel[company.status]}</span></td>
                          <td className="px-5 py-4">
                            <div className="flex items-center justify-end gap-1">
                              <IconAction label="Editar empresa" onClick={() => openEditCompany(company)}><Pencil className="h-4 w-4" /></IconAction>
                              <IconAction label="Gerenciar administradores" onClick={() => void openAdmins(company)} tone={company.active_admins_count ? 'default' : 'danger'}><UserCog className="h-4 w-4" /></IconAction>
                              <IconAction label="Gerar backup" disabled={transferring} onClick={() => void backupCompany(company)}><DatabaseBackup className="h-4 w-4" /></IconAction>
                              <IconAction label="Importar dump" disabled={transferring} onClick={() => chooseDump(company)}><Upload className="h-4 w-4" /></IconAction>
                              {company.status === 'active' && (
                                <a className="btn-ghost h-9 w-9 !p-0" href={`/${company.slug}/kiosk`} target="_blank" rel="noreferrer" title="Abrir totem" aria-label="Abrir totem">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              )}
                              {company.status === 'active' && (
                                <IconAction
                                  label={company.active_admins_count ? 'Acessar empresa' : 'Cadastre um administrador ativo para acessar'}
                                  disabled={!company.active_admins_count || accessingCompanyId === company.id}
                                  onClick={() => void accessCompany(company)}
                                >
                                  {accessingCompanyId === company.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                                </IconAction>
                              )}
                              {company.is_primary ? (
                                <span className="btn-ghost h-9 w-9 !p-0 opacity-50" title="A empresa principal deve permanecer ativa" aria-label="Empresa principal protegida"><ShieldCheck className="h-4 w-4" /></span>
                              ) : company.status === 'active' ? (
                                <IconAction label="Suspender empresa" tone="danger" onClick={() => void changeStatus(company, 'suspended')}><CirclePause className="h-4 w-4" /></IconAction>
                              ) : (
                                <IconAction label="Reativar empresa" onClick={() => void changeStatus(company, 'active')}><CirclePlay className="h-4 w-4" /></IconAction>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>

      {editingCompany !== undefined && (
        <CompanyModal
          editing={Boolean(editingCompany)}
          form={companyForm}
          saving={savingCompany}
          fetchingCnpj={fetchingCnpj}
          onClose={closeCompanyModal}
          onSubmit={saveCompany}
          onFieldChange={setCompanyField}
          onFetchCnpj={() => void fetchCnpj()}
          onGenerateKioskKey={generateKioskKey}
        />
      )}

      {adminCompany && (
        <AdminModal
          company={adminCompany}
          admins={admins}
          loading={loadingAdmins}
          saving={savingAdmin}
          editingAdmin={editingAdmin}
          form={adminForm}
          onClose={closeAdmins}
          onSubmit={saveAdmin}
          onFieldChange={setAdminField}
          onEdit={startEditingAdmin}
          onReset={resetAdminForm}
        />
      )}
    </div>
  );
}

function CompanyModal({
  editing,
  form,
  saving,
  fetchingCnpj,
  onClose,
  onSubmit,
  onFieldChange,
  onFetchCnpj,
  onGenerateKioskKey,
}: {
  editing: boolean;
  form: CompanyFormState;
  saving: boolean;
  fetchingCnpj: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  onFieldChange: (field: keyof CompanyFormState, value: string) => void;
  onFetchCnpj: () => void;
  onGenerateKioskKey: () => void;
}) {
  return (
    <div className="modal-shell">
      <div className="modal-card max-h-[92vh] max-w-4xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#ebe8e8] bg-[#fcfbfb] px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold">{editing ? 'Editar empresa' : 'Provisionar empresa'}</h2>
            <p className="mt-1 text-xs text-[#6e6a6a]">{editing ? 'Atualize os dados cadastrais e o identificador do ambiente.' : 'Crie o ambiente primeiro; depois importe o dump ou cadastre um administrador.'}</p>
          </div>
          <button className="btn-ghost" onClick={onClose} aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>

        <form className="p-6" onSubmit={onSubmit}>
          <h3 className="text-sm font-semibold">Dados da empresa</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Razão social" value={form.legal_name} onChange={(value) => onFieldChange('legal_name', value)} required />
            <Field label="Nome fantasia" value={form.trade_name || ''} onChange={(value) => onFieldChange('trade_name', value)} />
            <Field label="Identificador (slug)" value={form.slug} onChange={(value) => onFieldChange('slug', value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} required placeholder="empresa-exemplo" />
            <label className="block">
              <span className="mb-1.5 flex items-center justify-between">
                <span className="field-label mb-0">CNPJ</span>
                <button type="button" className="text-xs font-semibold text-[#026666] hover:text-[#014444] disabled:opacity-50" onClick={onFetchCnpj} disabled={fetchingCnpj}>
                  {fetchingCnpj ? 'Buscando...' : 'Buscar dados'}
                </button>
              </span>
              <input className="field-input" value={form.cnpj || ''} onChange={(event) => onFieldChange('cnpj', event.target.value)} placeholder="00.000.000/0000-00" />
            </label>
            <Field label="E-mail corporativo" type="email" value={form.email || ''} onChange={(value) => onFieldChange('email', value)} />
            <Field label="Telefone" value={form.phone || ''} onChange={(value) => onFieldChange('phone', value)} />
            <Field label="Endereço" value={form.address_line || ''} onChange={(value) => onFieldChange('address_line', value)} />
            <Field label="CEP" value={form.zip_code || ''} onChange={(value) => onFieldChange('zip_code', value)} />
            <Field label="Cidade" value={form.city || ''} onChange={(value) => onFieldChange('city', value)} />
            <Field label="Estado" value={form.state || ''} onChange={(value) => onFieldChange('state', value)} />
          </div>

          {!editing && (
            <div className="mt-7 border-t border-[#ebe8e8] pt-6">
              <label className="block">
                <span className="flex items-center justify-between">
                  <span className="field-label">Chave do quiosque</span>
                  <button type="button" className="mb-1.5 text-xs font-semibold text-[#026666] hover:underline" onClick={onGenerateKioskKey}>Gerar chave segura</button>
                </span>
                <input className="field-input" type="text" value={form.kiosk_access_key} onChange={(event) => onFieldChange('kiosk_access_key', event.target.value)} required minLength={12} />
              </label>
            </div>
          )}

          <div className="mt-7 flex justify-end gap-3">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar empresa'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AdminModal({
  company,
  admins,
  loading,
  saving,
  editingAdmin,
  form,
  onClose,
  onSubmit,
  onFieldChange,
  onEdit,
  onReset,
}: {
  company: PlatformCompany;
  admins: CompanyAdmin[];
  loading: boolean;
  saving: boolean;
  editingAdmin: CompanyAdmin | null;
  form: AdminFormState;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  onFieldChange: (field: keyof AdminFormState, value: string) => void;
  onEdit: (admin: CompanyAdmin) => void;
  onReset: () => void;
}) {
  return (
    <div className="modal-shell">
      <div className="modal-card max-h-[92vh] max-w-5xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#ebe8e8] bg-[#fcfbfb] px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold">Administradores</h2>
            <p className="mt-1 text-xs text-[#6e6a6a]">{company.trade_name || company.legal_name}</p>
          </div>
          <button className="btn-ghost" onClick={onClose} aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Usuários cadastrados</h3>
              <span className="status-chip border-[#dceaea] bg-[#edf8f8] text-[#026666]">{admins.length} admin(s)</span>
            </div>
            <div className="mt-4 space-y-3">
              {loading ? (
                <div className="surface-muted p-5 text-center text-sm text-[#6e6a6a]">Carregando...</div>
              ) : admins.length === 0 ? (
                <div className="surface-muted p-5 text-sm text-[#6e6a6a]">Nenhum administrador encontrado. Cadastre um para liberar o acesso à empresa.</div>
              ) : admins.map((admin) => (
                <div key={admin.id} className="rounded-xl border border-[#e7e4e4] bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[#191717]">{admin.name}</div>
                      <div className="mt-1 truncate text-xs text-[#6e6a6a]">{admin.email}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className={`status-chip ${admin.status === 'active' ? 'border-[#dceaea] bg-[#edf8f8] text-[#026666]' : 'border-[#f0dede] bg-[#fbf1f1] text-[#b43737]'}`}>{admin.status === 'active' ? 'Ativo' : 'Inativo'}</span>
                        {admin.must_change_password && <span className="status-chip border-amber-200 bg-amber-50 text-amber-700">Troca de senha pendente</span>}
                      </div>
                    </div>
                    <IconAction label={`Editar ${admin.name}`} onClick={() => onEdit(admin)}><Pencil className="h-4 w-4" /></IconAction>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-[#e7e4e4] bg-[#f8f6f6] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">{editingAdmin ? 'Editar administrador' : 'Novo administrador'}</h3>
                <p className="mt-1 text-xs leading-5 text-[#6e6a6a]">Se o e-mail já tiver uma conta global, a senha existente será preservada.</p>
              </div>
              {editingAdmin && <button type="button" className="text-xs font-semibold text-[#026666] hover:underline" onClick={onReset}>Novo</button>}
            </div>

            <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
              <Field label="Nome" value={form.name} onChange={(value) => onFieldChange('name', value)} required />
              <Field label="E-mail" type="email" value={form.email} onChange={(value) => onFieldChange('email', value)} required />
              <Field label="CPF" value={form.cpf} onChange={(value) => onFieldChange('cpf', value)} required />
              <Field label="Matrícula" value={form.registration_number} onChange={(value) => onFieldChange('registration_number', value)} required />
              <Field
                label={editingAdmin ? 'Nova senha (opcional)' : 'Senha temporária'}
                type="password"
                value={form.password}
                onChange={(value) => onFieldChange('password', value)}
                required={!editingAdmin}
                placeholder={editingAdmin ? 'Deixe em branco para manter' : undefined}
              />
              {editingAdmin ? (
                <label className="block">
                  <span className="field-label">Status</span>
                  <select className="field-input" value={form.status} onChange={(event) => onFieldChange('status', event.target.value)}>
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </label>
              ) : <div />}
              <p className="md:col-span-2 text-xs leading-5 text-[#6e6a6a]">A senha deve ter de 8 a 72 caracteres, com letra maiúscula, minúscula e número.</p>
              <div className="md:col-span-2 flex justify-end gap-3">
                {editingAdmin && <button type="button" className="btn-secondary" onClick={onReset}>Cancelar edição</button>}
                <button className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : editingAdmin ? 'Salvar administrador' : 'Criar administrador'}</button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}

function IconAction({ label, onClick, disabled = false, tone = 'default', children }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`btn-ghost h-9 w-9 !p-0 disabled:cursor-not-allowed disabled:opacity-40 ${tone === 'danger' ? 'text-[#b43737] hover:text-[#8f2929]' : ''}`}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Field({ label, value, onChange, type = 'text', required = false, placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input className="field-input" type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} placeholder={placeholder} />
    </label>
  );
}
