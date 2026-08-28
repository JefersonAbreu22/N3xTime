import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  platformApi,
  type PlatformCompany,
  type PlatformLog,
  type PlatformLogCategory,
} from '../../services/platformApi';

const categoryLabels: Record<PlatformLogCategory, string> = {
  platform: 'Plataforma',
  audit: 'Auditoria',
  biometric: 'Biometria',
  clock: 'Ponto',
  request: 'Solicitação',
  email: 'E-mail',
};

const categoryClasses: Record<PlatformLogCategory, string> = {
  platform: 'border-violet-200 bg-violet-50 text-violet-700',
  audit: 'border-slate-200 bg-slate-50 text-slate-700',
  biometric: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  clock: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  request: 'border-amber-200 bg-amber-50 text-amber-700',
  email: 'border-blue-200 bg-blue-50 text-blue-700',
};

const parseDetails = (details: PlatformLog['details']) => {
  if (!details) return null;
  if (typeof details === 'object') return details;
  try {
    return JSON.parse(details) as Record<string, unknown>;
  } catch {
    return { value: details };
  }
};

export default function PlatformLogs() {
  const [companies, setCompanies] = useState<PlatformCompany[]>([]);
  const [items, setItems] = useState<PlatformLog[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState({ companyId: '', category: '', search: '', from: '', to: '' });

  useEffect(() => {
    platformApi.listCompanies().then((response) => setCompanies(response.data)).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const response = await platformApi.listLogs({
        page,
        limit: 50,
        companyId: applied.companyId ? Number(applied.companyId) : undefined,
        category: (applied.category || undefined) as PlatformLogCategory | undefined,
        search: applied.search || undefined,
        from: applied.from || undefined,
        to: applied.to || undefined,
      });
      setItems(response.data.items);
      setPages(response.data.pagination.pages);
      setTotal(response.data.pagination.total);
    } catch (error: unknown) {
      toast.error((error as { response?: { data?: { error?: string } } }).response?.data?.error || 'Não foi possível carregar os logs.');
    } finally {
      setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => { void load(); }, [load]);

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setApplied({ companyId, category, search: search.trim(), from, to });
  };

  const clearFilters = () => {
    setCompanyId(''); setCategory(''); setSearch(''); setFrom(''); setTo(''); setPage(1);
    setApplied({ companyId: '', category: '', search: '', from: '', to: '' });
  };

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-[#026666]">Auditoria central</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">Logs da plataforma</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6e6a6a]">Eventos administrativos, alterações, registros de ponto, biometria, solicitações e entregas de e-mail de todas as empresas.</p>
        </div>
        <button className="btn-secondary" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Atualizar</button>
      </div>

      <form className="surface-panel mt-6 grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-6" onSubmit={applyFilters}>
        <label className="xl:col-span-2"><span className="field-label">Buscar</span><span className="relative block"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#777]" /><input className="field-input pl-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Evento, usuário, e-mail ou empresa" /></span></label>
        <label><span className="field-label">Empresa</span><select className="field-input" value={companyId} onChange={(event) => setCompanyId(event.target.value)}><option value="">Todas</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.trade_name || company.legal_name}</option>)}</select></label>
        <label><span className="field-label">Categoria</span><select className="field-input" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Todas</option>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span className="field-label">Data inicial</span><input className="field-input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label><span className="field-label">Data final</span><input className="field-input" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <div className="flex gap-3 md:col-span-2 xl:col-span-6 xl:justify-end"><button type="button" className="btn-secondary" onClick={clearFilters}>Limpar</button><button className="btn-primary">Aplicar filtros</button></div>
      </form>

      <div className="mt-5 flex items-center justify-between text-xs text-[#6e6a6a]"><span>{total.toLocaleString('pt-BR')} eventos encontrados</span><span>Página {page} de {pages}</span></div>

      <section className="surface-panel mt-3 overflow-hidden">
        {loading ? <div className="py-16 text-center text-sm text-[#6e6a6a]">Carregando logs...</div> : items.length === 0 ? <div className="py-16 text-center text-sm text-[#6e6a6a]">Nenhum evento encontrado para os filtros informados.</div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-[#f7f5f5] text-[10px] uppercase tracking-[0.13em] text-[#6e6a6a]"><tr><th className="w-10 px-4 py-3" /><th className="px-4 py-3">Data</th><th className="px-4 py-3">Categoria</th><th className="px-4 py-3">Evento</th><th className="px-4 py-3">Empresa</th><th className="px-4 py-3">Responsável</th><th className="px-4 py-3">Alvo</th><th className="px-4 py-3">Origem</th><th className="px-4 py-3">Resultado</th></tr></thead><tbody>
            {items.map((item) => {
              const isExpanded = expanded === item.id;
              const details = parseDetails(item.details);
              return [
                <tr key={item.id} className="border-t border-[#ebe8e8] align-top hover:bg-[#faf9f9]"><td className="px-4 py-4"><button className="text-[#6e6a6a]" onClick={() => setExpanded(isExpanded ? null : item.id)} aria-label="Detalhar evento">{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button></td><td className="whitespace-nowrap px-4 py-4 text-xs text-[#6e6a6a]">{new Date(item.occurred_at).toLocaleString('pt-BR')}</td><td className="px-4 py-4"><span className={`status-chip ${categoryClasses[item.category]}`}>{categoryLabels[item.category]}</span></td><td className="px-4 py-4 font-mono text-xs font-semibold">{item.event}</td><td className="px-4 py-4">{item.company_name || 'Plataforma'}</td><td className="px-4 py-4"><div>{item.actor_name || 'Sistema'}</div>{item.actor_email && <div className="mt-1 text-xs text-[#777]">{item.actor_email}</div>}</td><td className="px-4 py-4">{item.subject_name || '—'}</td><td className="px-4 py-4 font-mono text-xs text-[#6e6a6a]">{item.ip_address || '—'}</td><td className="px-4 py-4">{item.success === null ? <span className="text-[#777]">Informativo</span> : item.success ? <span className="font-semibold text-emerald-700">Sucesso</span> : <span className="font-semibold text-red-700">Falha</span>}</td></tr>,
                isExpanded && <tr key={`${item.id}:details`} className="border-t border-[#ebe8e8] bg-[#f8f6f6]"><td /><td colSpan={8} className="px-4 py-5"><div className="grid gap-4 lg:grid-cols-3"><div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#777]">Identificação</div><div className="mt-2 font-mono text-xs">{item.id}</div></div><div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#777]">Dispositivo</div><div className="mt-2 break-all text-xs">{item.device_info || 'Não informado'}</div></div><div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#777]">Integridade</div><div className="mt-2 flex items-center gap-2 text-xs"><ShieldCheck className="h-4 w-4 text-[#026666]" />Evento persistido no banco</div></div></div><div className="mt-5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#777]">Detalhes técnicos</div><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-[#191717] p-4 text-xs leading-6 text-[#d7eeee]">{JSON.stringify(details || {}, null, 2)}</pre></td></tr>,
              ];
            })}
          </tbody></table></div>
        )}
      </section>

      <div className="mt-5 flex justify-end gap-3"><button className="btn-secondary" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><button className="btn-secondary" disabled={page >= pages || loading} onClick={() => setPage((value) => Math.min(pages, value + 1))}>Próxima</button></div>
    </div>
  );
}
