import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Search, ShieldAlert, UserMinus, Users } from 'lucide-react';
import {
  accessRestrictionLabels,
  usersApi,
  type AccessRestrictionType,
  type TeamUser,
} from '../../../services/usersApi';
import { useAuthStore } from '../../../stores/authStore';
import SuspensionModal from '../../../components/dashboard/SuspensionModal';

const formatDate = (value?: string | null) => value
  ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString('pt-BR')
  : 'Sem data';

const restrictionTone = (type?: AccessRestrictionType | null) => {
  if (type === 'termination' || type === 'judicial_detention') return 'border-[#f0dede] bg-[#fbf1f1] text-[#b43737]';
  if (type === 'inss_leave' || type === 'occupational_leave' || type === 'permanent_disability_retirement') return 'border-[#e7dcc4] bg-[#fff8e8] text-[#8b641e]';
  if (type === 'parental_leave' || type === 'family_care_leave' || type === 'protective_measure') return 'border-[#d9d0e2] bg-[#f5f0f8] text-[#74528d]';
  return 'border-[#dceaea] bg-[#edf8f8] text-[#026666]';
};

export default function RestrictionsTab() {
  const auth = useAuthStore();
  const canManageTeam = auth.user?.role === 'admin' || auth.user?.leadership_permissions?.includes('manage_team');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | AccessRestrictionType>('');
  const [newUserId, setNewUserId] = useState('');
  const [selectedUser, setSelectedUser] = useState<TeamUser | null>(null);

  const team = useQuery({
    queryKey: ['users', 'team'],
    queryFn: async () => (await usersApi.team()).data,
    enabled: Boolean(canManageTeam),
  });

  const activeUsers = useMemo(() => (team.data ?? []).filter((user) => user.status === 'active' && user.role !== 'admin'), [team.data]);
  const restrictedUsers = useMemo(() => (team.data ?? []).filter((user) => user.status === 'suspended'), [team.data]);
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  const filteredUsers = useMemo(() => restrictedUsers.filter((user) => {
    if (typeFilter && user.suspension_type !== typeFilter) return false;
    if (!normalizedSearch) return true;
    return [user.name, user.email, user.department?.name, user.suspension_reason, user.suspension_type ? accessRestrictionLabels[user.suspension_type] : '']
      .some((value) => value?.toLocaleLowerCase('pt-BR').includes(normalizedSearch));
  }), [normalizedSearch, restrictedUsers, typeFilter]);

  const counts = useMemo(() => restrictedUsers.reduce<Partial<Record<AccessRestrictionType, number>>>((acc, user) => {
    if (user.suspension_type) acc[user.suspension_type] = (acc[user.suspension_type] ?? 0) + 1;
    return acc;
  }, {}), [restrictedUsers]);
  const withReturn = restrictedUsers.filter((user) => user.suspension_end_at).length;
  const withoutReturn = restrictedUsers.length - withReturn;
  const terminations = counts.termination ?? 0;
  const now = Date.now();
  const sevenDaysFromNow = now + 7 * 24 * 60 * 60 * 1000;
  const upcomingReturns = restrictedUsers.filter((user) => {
    if (!user.suspension_end_at) return false;
    const timestamp = new Date(user.suspension_end_at).getTime();
    return timestamp >= now && timestamp <= sevenDaysFromNow;
  }).length;

  if (!canManageTeam) {
    return <div className="surface-panel p-8 text-center text-sm text-[#6e6a6a]">Você não possui permissão para gerenciar vínculos e afastamentos.</div>;
  }

  const openNewRestriction = () => {
    const user = activeUsers.find((item) => item.id === Number(newUserId));
    if (user) setSelectedUser(user);
  };

  return (
    <div className="space-y-5">
      <section className="surface-panel overflow-hidden rounded-2xl">
        <div className="grid lg:grid-cols-[1fr_auto]">
          <div className="p-5 md:p-6">
            <div className="section-kicker">Controle de vínculo e acesso</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#191717]">Afastamentos e desligamentos</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6e6a6a]">Acompanhe quem está bloqueado, por qual situação e quando o acesso será liberado automaticamente.</p>
          </div>
          <div className="flex min-w-80 flex-col justify-center gap-2 border-t border-[#e7e4e4] bg-[#f8fcfc] p-5 lg:border-l lg:border-t-0">
            <label className="field-label" htmlFor="restriction-user">Registrar nova situação</label>
            <div className="flex gap-2">
              <select id="restriction-user" className="field-input min-w-0 flex-1" value={newUserId} onChange={(event) => setNewUserId(event.target.value)}>
                <option value="">Selecione o colaborador</option>
                {activeUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
              <button type="button" className="btn-primary shrink-0" disabled={!newUserId} onClick={openNewRestriction}>Abrir hub</button>
            </div>
          </div>
        </div>
        <div className="grid border-t border-[#e7e4e4] sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Casos ativos', value: restrictedUsers.length, icon: Users, color: 'text-[#191717]' },
            { label: 'Com retorno', value: withReturn, icon: CalendarClock, color: 'text-[#026666]' },
            { label: 'Sem data final', value: withoutReturn, icon: ShieldAlert, color: 'text-[#8b641e]' },
            { label: 'Desligamentos', value: terminations, icon: UserMinus, color: 'text-[#b43737]' },
          ].map((item, index) => {
            const MetricIcon = item.icon;
            return <div key={item.label} className={`p-4 md:p-5 ${index < 3 ? 'border-b border-[#e7e4e4] sm:border-r xl:border-b-0' : ''}`}><div className="flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#777171]">{item.label}</span><MetricIcon className="h-4 w-4 text-[#8a8585]" /></div><div className={`mt-3 text-2xl font-semibold ${item.color}`}>{item.value}</div>{index === 1 && <div className="mt-1 text-[10px] text-[#777171]">{upcomingReturns} nos próximos 7 dias</div>}</div>;
          })}
        </div>
      </section>

      <section className="grid items-start gap-5 xl:grid-cols-[1fr_320px]">
        <div className="surface-panel overflow-hidden rounded-2xl">
          <div className="flex flex-col gap-3 border-b border-[#e7e4e4] p-4 sm:flex-row md:p-5">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a8585]" />
              <input className="field-input pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar colaborador, setor ou motivo" />
            </label>
            <select className="field-input sm:w-64" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as '' | AccessRestrictionType)}>
              <option value="">Todas as situações</option>
              {(Object.entries(accessRestrictionLabels) as Array<[AccessRestrictionType, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>

          {team.isLoading ? <div className="py-16 text-center text-sm text-[#6e6a6a]">Carregando situações...</div> : filteredUsers.length ? (
            <div className="divide-y divide-[#ece8e8]">
              {filteredUsers.map((user) => (
                <div key={user.id} className="grid gap-4 p-4 md:grid-cols-[1.1fr_1fr_auto] md:items-center md:p-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#ddd8d8] bg-[#f6f4f4] text-[10px] font-bold text-[#514c4c]">{user.name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span>
                    <div className="min-w-0"><div className="truncate text-sm font-semibold text-[#191717]">{user.name}</div><div className="mt-1 truncate text-xs text-[#6e6a6a]">{user.department?.name || 'Sem setor'} · {user.email}</div></div>
                  </div>
                  <div>
                    <span className={`status-chip ${restrictionTone(user.suspension_type)}`}>{user.suspension_type ? accessRestrictionLabels[user.suspension_type] : 'Acesso suspenso'}</span>
                    <div className="mt-2 text-xs text-[#6e6a6a]">Início: {formatDate(user.suspension_start_date || user.suspended_at)} · Retorno: {user.suspension_end_at ? formatDate(user.suspension_end_at) : 'não definido'}</div>
                    {user.suspension_reason && <div className="mt-1 line-clamp-1 text-[10px] text-[#817b7b]" title={user.suspension_reason}>{user.suspension_reason}</div>}
                  </div>
                  <button type="button" className="btn-secondary justify-self-start md:justify-self-end" onClick={() => setSelectedUser(user)}>Gerenciar</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-64 items-center justify-center px-6 text-center"><div><ShieldAlert className="mx-auto h-7 w-7 text-[#8a8585]" /><div className="mt-3 text-sm font-semibold text-[#191717]">Nenhuma situação encontrada</div><p className="mt-1 text-xs text-[#6e6a6a]">Ajuste os filtros ou registre um novo afastamento.</p></div></div>
          )}
        </div>

        <aside className="surface-panel overflow-hidden rounded-2xl">
          <div className="border-b border-[#e7e4e4] p-4 md:p-5"><div className="section-kicker">Catálogo disponível</div><h3 className="mt-2 text-lg font-semibold text-[#191717]">Situações reconhecidas</h3><p className="mt-1 text-xs leading-5 text-[#6e6a6a]">Categorias que bloqueiam acesso e registro de ponto.</p></div>
          <div className="max-h-[560px] divide-y divide-[#ece8e8] overflow-y-auto">
            {(Object.entries(accessRestrictionLabels) as Array<[AccessRestrictionType, string]>).map(([type, label]) => (
              <button key={type} type="button" onClick={() => setTypeFilter(type)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[#f8f6f6] md:px-5">
                <span className="text-xs font-medium text-[#4d4949]">{label}</span><span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${counts[type] ? 'bg-[#e7f5f3] text-[#026666]' : 'bg-[#f0eeee] text-[#8a8585]'}`}>{counts[type] ?? 0}</span>
              </button>
            ))}
          </div>
        </aside>
      </section>

      {selectedUser && <SuspensionModal user={selectedUser} onClose={() => setSelectedUser(null)} />}
    </div>
  );
}
