import { useState } from 'react';
import { Building, Check, ChevronDown, ChevronUp, Plus, Search, ShieldCheck, Trash2, Users } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Department, departmentsApi, HierarchyLevel, LeadershipPermission } from '../../../services/departmentsApi';
import { TeamUser, usersApi } from '../../../services/usersApi';

const permissionOptions: Array<{ key: LeadershipPermission; label: string; description: string }> = [
  { key: 'view_team', label: 'Visualizar equipe', description: 'Lista e dados básicos dos colaboradores.' },
  { key: 'manage_team', label: 'Editar equipe', description: 'Cadastro, jornada e dados operacionais.' },
  { key: 'view_time_records', label: 'Consultar ponto', description: 'Marcações e espelho do ponto.' },
  { key: 'manage_time_records', label: 'Ajustar ponto', description: 'Correções e intervenções nas marcações.' },
  { key: 'approve_requests', label: 'Aprovar solicitações', description: 'Atestados, ajustes e justificativas.' },
  { key: 'view_reports', label: 'Visualizar relatórios', description: 'Indicadores e relatórios do setor.' },
  { key: 'manage_biometrics', label: 'Gerenciar biometria', description: 'Cadastro e reset facial.' },
];
const defaultPermissions: LeadershipPermission[] = ['view_team', 'view_time_records', 'approve_requests', 'view_reports'];

function SearchableUserSelect({ users, value, disabledUserIds, onChange }: {
  users: TeamUser[];
  value: number;
  disabledUserIds: Set<number>;
  onChange: (userId: number) => void;
}) {
  const selected = users.find((user) => user.id === value);
  const [query, setQuery] = useState(selected?.name ?? '');
  const [open, setOpen] = useState(false);
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  const results = users.filter((user) => {
    if (user.status !== 'active' || user.role === 'admin') return false;
    const haystack = `${user.name} ${user.email} ${user.department?.name ?? ''}`.toLocaleLowerCase('pt-BR');
    return !normalized || haystack.includes(normalized);
  }).slice(0, 12);

  return <div className="relative flex-1">
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b8686]" />
      <input
        className="field-input pl-9"
        value={open ? query : selected?.name ?? query}
        placeholder="Pesquise por nome, e-mail ou setor"
        onFocus={() => { setQuery(selected?.name ?? ''); setOpen(true); }}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); if (value) onChange(0); }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
    </div>
    {open && <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-[#ddd8d8] bg-white p-1 shadow-xl">
      {results.length === 0 ? <div className="px-3 py-4 text-center text-sm text-[#6e6a6a]">Nenhum usuário encontrado.</div> : results.map((user) => {
        const disabled = disabledUserIds.has(user.id);
        return <button key={user.id} type="button" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(user.id); setQuery(user.name); setOpen(false); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-[#edf8f8] disabled:cursor-not-allowed disabled:opacity-40">
          <span><span className="block text-sm font-semibold text-[#191717]">{user.name}</span><span className="block text-xs text-[#6e6a6a]">{user.email} · {user.department?.name ?? 'Sem setor'}</span></span>
          {user.id === value && <Check className="h-4 w-4 text-[#026666]" />}
        </button>;
      })}
    </div>}
  </div>;
}

const cloneLevels = (department: Department): HierarchyLevel[] =>
  (department.hierarchy_levels ?? []).map((level) => ({
    id: level.id,
    name: level.name,
    position: level.position,
    leaders: level.leaders.map((leader) => ({
      id: leader.id,
      user_id: leader.user_id,
      permissions: Array.isArray(leader.permissions) ? [...leader.permissions] : [],
    })),
  }));

export default function DepartmentsTab() {
  const queryClient = useQueryClient();
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptForm, setDeptForm] = useState({ name: '' });
  const [hierarchyDepartment, setHierarchyDepartment] = useState<Department | null>(null);
  const [levels, setLevels] = useState<HierarchyLevel[]>([]);

  const depts = useQuery({ queryKey: ['departments'], queryFn: async () => (await departmentsApi.list()).data });
  const team = useQuery({ queryKey: ['users', 'team'], queryFn: async () => (await usersApi.team()).data });
  const saveDept = useMutation({
    mutationFn: async () => editingDept ? departmentsApi.update(editingDept.id, deptForm.name) : departmentsApi.create(deptForm.name),
    onSuccess: async () => {
      toast.success(editingDept ? 'Setor atualizado.' : 'Setor criado.');
      setDeptForm({ name: '' }); setEditingDept(null); setIsDeptModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: () => toast.error('Erro ao salvar setor.'),
  });
  const saveHierarchy = useMutation({
    mutationFn: async () => {
      if (!hierarchyDepartment) return;
      return departmentsApi.updateHierarchy(hierarchyDepartment.id, levels);
    },
    onSuccess: async () => {
      toast.success('Hierarquia e permissões atualizadas.'); setHierarchyDepartment(null);
      await queryClient.invalidateQueries({ queryKey: ['departments'] });
      await queryClient.invalidateQueries({ queryKey: ['users', 'team'] });
    },
    onError: (error: unknown) => toast.error((error as { response?: { data?: { error?: string } } }).response?.data?.error || 'Erro ao salvar hierarquia.'),
  });
  const removeDept = useMutation({
    mutationFn: async (id: number) => { if (!confirm('Deseja realmente remover este setor?')) throw new Error('Cancelled'); await departmentsApi.delete(id); },
    onSuccess: async () => { toast.success('Setor removido.'); await queryClient.invalidateQueries({ queryKey: ['departments'] }); },
    onError: (error: unknown) => { const err = error as { message: string; response?: { data?: { error?: string } } }; if (err.message !== 'Cancelled') toast.error(err.response?.data?.error || 'Erro ao remover setor.'); },
  });

  const moveLevel = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= levels.length) return;
    const next = [...levels]; [next[index], next[target]] = [next[target], next[index]]; setLevels(next);
  };

  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div><h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#191717]">Setores e hierarquias</h2><p className="mt-2 text-sm text-[#6e6a6a]">Monte a escada de liderança, adicione responsáveis paralelos e determine o alcance de cada um.</p></div>
      <button onClick={() => { setEditingDept(null); setDeptForm({ name: '' }); setIsDeptModalOpen(true); }} className="btn-primary"><Plus className="h-4 w-4" />Novo setor</button>
    </div>
    <div className="surface-muted rounded-2xl p-4 text-sm text-[#5f5a5a]"><strong className="text-[#191717]">Como funciona:</strong> o nível 1 é o mais alto. Líderes enxergam colaboradores do setor e líderes posicionados abaixo deles, conforme suas permissões. Usuários no mesmo nível não administram uns aos outros.</div>
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {depts.isLoading ? <div className="col-span-full py-12 text-center text-[#6e6a6a]">Carregando setores...</div> : depts.data?.length === 0 ? <div className="col-span-full surface-panel py-16 text-center text-[#6e6a6a]">Nenhum setor cadastrado.</div> : depts.data?.map((dept) => {
        const leaders = dept.hierarchy_levels?.reduce((sum, level) => sum + level.leaders.length, 0) ?? 0;
        return <div key={dept.id} className="surface-panel flex flex-col justify-between p-6">
          <div><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f8f6f6]"><Building className="h-5 w-5 text-[#026666]" /></div><div><h3 className="font-semibold text-[#191717]">{dept.name}</h3><p className="text-sm text-[#6e6a6a]">{dept.users?.length || 0} membro(s)</p></div></div>
          <div className="mt-5 grid grid-cols-2 gap-2"><div className="surface-muted rounded-xl p-3"><div className="text-xs text-[#6e6a6a]">Níveis</div><div className="mt-1 font-semibold">{dept.hierarchy_levels?.length ?? 0}</div></div><div className="surface-muted rounded-xl p-3"><div className="text-xs text-[#6e6a6a]">Líderes</div><div className="mt-1 font-semibold">{leaders}</div></div></div></div>
          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-[#ece8e8] pt-4"><button onClick={() => { setHierarchyDepartment(dept); setLevels(cloneLevels(dept)); }} className="btn-secondary"><ShieldCheck className="h-4 w-4" />Configurar hierarquia</button><button onClick={() => { setEditingDept(dept); setDeptForm({ name: dept.name }); setIsDeptModalOpen(true); }} className="btn-ghost">Editar</button><button onClick={() => removeDept.mutate(dept.id)} className="btn-ghost text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div>
        </div>;
      })}
    </div>

    {isDeptModalOpen && <div className="modal-shell"><div className="modal-card max-w-md overflow-hidden"><div className="border-b border-[#ece8e8] bg-[#fcfbfb] px-6 py-5"><div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#026666]">Setores</div><h3 className="mt-2 text-2xl font-semibold">{editingDept ? 'Editar setor' : 'Novo setor'}</h3></div><div className="p-6"><label className="field-label">Nome do setor</label><input className="field-input mt-1.5" placeholder="Ex: Tecnologia da Informação" value={deptForm.name} onChange={(event) => setDeptForm({ name: event.target.value })} /></div><div className="flex justify-end gap-3 border-t border-[#ece8e8] bg-[#f8f6f6] px-6 py-4"><button onClick={() => setIsDeptModalOpen(false)} className="btn-secondary">Cancelar</button><button onClick={() => saveDept.mutate()} disabled={saveDept.isPending || deptForm.name.trim().length < 2} className="btn-primary">{saveDept.isPending ? 'Salvando...' : 'Salvar'}</button></div></div></div>}

    {hierarchyDepartment && <div className="modal-shell"><div className="modal-card max-h-[94vh] max-w-5xl overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[#ece8e8] bg-[#fcfbfb]/95 px-6 py-5 backdrop-blur"><div><div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#026666]">Hierarquia do setor</div><h3 className="mt-2 text-2xl font-semibold">{hierarchyDepartment.name}</h3><p className="mt-1 text-sm text-[#6e6a6a]">Ordene do maior nível de autoridade até o mais próximo do colaborador.</p></div><button onClick={() => setHierarchyDepartment(null)} className="btn-ghost">✕</button></div>
      <div className="space-y-4 p-6">
        {levels.length === 0 && <div className="surface-muted py-10 text-center"><Users className="mx-auto h-8 w-8 text-[#8b8686]" /><p className="mt-3 text-sm text-[#6e6a6a]">A hierarquia ainda não possui níveis. Comece pelo nível mais alto.</p></div>}
        {levels.map((level, levelIndex) => <div key={level.id ?? `new-${levelIndex}`} className="rounded-2xl border border-[#ddd8d8] bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#026666] text-sm font-bold text-white">{levelIndex + 1}</div><input className="field-input flex-1" placeholder="Ex: Gerência, Coordenação, Supervisão" value={level.name} onChange={(event) => setLevels((current) => current.map((item, index) => index === levelIndex ? { ...item, name: event.target.value } : item))} /><div className="flex gap-1"><button title="Subir nível" className="btn-ghost" disabled={levelIndex === 0} onClick={() => moveLevel(levelIndex, -1)}><ChevronUp className="h-4 w-4" /></button><button title="Descer nível" className="btn-ghost" disabled={levelIndex === levels.length - 1} onClick={() => moveLevel(levelIndex, 1)}><ChevronDown className="h-4 w-4" /></button><button title="Remover nível" className="btn-ghost text-red-600" onClick={() => setLevels((current) => current.filter((_, index) => index !== levelIndex))}><Trash2 className="h-4 w-4" /></button></div></div>
          <div className="mt-5 space-y-3"><div className="flex items-center justify-between"><h4 className="text-sm font-semibold">Responsáveis deste nível</h4><button className="btn-secondary" onClick={() => setLevels((current) => current.map((item, index) => index === levelIndex ? { ...item, leaders: [...item.leaders, { user_id: 0, permissions: [...defaultPermissions] }] } : item))}><Plus className="h-4 w-4" />Adicionar responsável</button></div>
          {level.leaders.map((leader, leaderIndex) => {
            const selectedElsewhere = new Set(levels.flatMap((item, i) => item.leaders.filter((_, j) => i !== levelIndex || j !== leaderIndex).map((entry) => Number(entry.user_id))));
            return <div key={leader.id ?? `leader-${leaderIndex}`} className="rounded-xl border border-[#ece8e8] bg-[#faf9f9] p-4"><div className="flex items-center gap-2"><SearchableUserSelect users={team.data ?? []} value={leader.user_id} disabledUserIds={selectedElsewhere} onChange={(userId) => setLevels((current) => current.map((item, index) => index === levelIndex ? { ...item, leaders: item.leaders.map((entry, i) => i === leaderIndex ? { ...entry, user_id: userId } : entry) } : item))} /><button className="btn-ghost text-red-600" onClick={() => setLevels((current) => current.map((item, index) => index === levelIndex ? { ...item, leaders: item.leaders.filter((_, i) => i !== leaderIndex) } : item))}><Trash2 className="h-4 w-4" /></button></div><div className="mt-2 text-xs text-[#6e6a6a]">O responsável pode pertencer a outro setor e liderar múltiplos setores.</div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{permissionOptions.map((permission) => { const checked = (leader.permissions as LeadershipPermission[]).includes(permission.key); return <label key={permission.key} title={permission.description} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-xs ${checked ? 'border-[#acd5d5] bg-[#edf8f8]' : 'border-[#e5e1e1] bg-white'}`}><input type="checkbox" className="mt-0.5" checked={checked} onChange={(event) => setLevels((current) => current.map((item, index) => index === levelIndex ? { ...item, leaders: item.leaders.map((entry, i) => i === leaderIndex ? { ...entry, permissions: event.target.checked ? [...entry.permissions as LeadershipPermission[], permission.key] : (entry.permissions as LeadershipPermission[]).filter((key) => key !== permission.key) } : entry) } : item))} /><span><span className="block font-semibold text-[#191717]">{permission.label}</span><span className="mt-0.5 block text-[#777272]">{permission.description}</span></span></label>; })}</div></div>;
          })}</div>
        </div>)}
        <button className="btn-secondary w-full justify-center border-dashed py-4" onClick={() => setLevels((current) => [...current, { name: '', leaders: [] }])}><Plus className="h-4 w-4" />Adicionar nível à hierarquia</button>
      </div>
      <div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#ece8e8] bg-[#f8f6f6]/95 px-6 py-4 backdrop-blur"><button onClick={() => setHierarchyDepartment(null)} className="btn-secondary">Cancelar</button><button onClick={() => saveHierarchy.mutate()} disabled={saveHierarchy.isPending || levels.some((level) => level.name.trim().length < 2 || level.leaders.some((leader) => !leader.user_id || !(leader.permissions as LeadershipPermission[]).length))} className="btn-primary">{saveHierarchy.isPending ? 'Salvando...' : 'Salvar hierarquia'}</button></div>
    </div></div>}
  </div>;
}
