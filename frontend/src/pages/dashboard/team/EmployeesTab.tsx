import { useMemo, useState } from 'react';
import { Plus, Users, Building, ChevronDown, ChevronRight } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../../stores/authStore';
import { usersApi } from '../../../services/usersApi';
import { departmentsApi, HierarchyLevel, LeadershipPermission } from '../../../services/departmentsApi';
import { authApi } from '../../../services/authApi';
import UserCard from '../../../components/dashboard/UserCard';
import EmployeeFormModal from './EmployeeFormModal';
import AssignAbsenceModal from '../../../components/dashboard/AssignAbsenceModal';
import { lazy, Suspense } from 'react';

interface UserTeam {
  id: number;
  name: string;
  email: string;
  role: string;
  department_id?: number | null;
  work_type?: string;
  status?: string;
  has_biometric?: boolean;
  biometric_sample_count?: number;
  remote_clock_in_enabled?: boolean;
  remote_clock_in_justification?: string;
  requires_time_tracking?: boolean;
  schedule?: {
    entry_time: string;
    exit_time: string;
    lunch_duration: number;
    flexible_lunch: boolean;
    work_days: number[];
    custom_workload?: Record<number, number> | null;
  };
  [key: string]: unknown;
}

interface DeptTeam {
  id: number;
  name: string;
  users?: UserTeam[];
  visible?: boolean;
  hierarchy_levels?: HierarchyLevel[];
}

const permissionLabels: Record<LeadershipPermission, string> = {
  view_team: 'Visualizar equipe', manage_team: 'Editar equipe', view_time_records: 'Consultar ponto',
  manage_time_records: 'Ajustar ponto', approve_requests: 'Aprovar solicitações',
  view_reports: 'Relatórios', manage_biometrics: 'Biometria',
};

const FaceRegistrationModal = lazy(() => import('../../../components/dashboard/FaceRegistrationModal'));

export default function EmployeesTab() {
  const auth = useAuthStore();
  const canManageTeam = auth.user?.role === 'admin' || auth.user?.leadership_permissions?.includes('manage_team');
  const queryClient = useQueryClient();
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [expandedDepts, setExpandedDepts] = useState<number[]>([]);
  const [editingUser, setEditingUser] = useState<UserTeam | null>(null);
  const [faceRegisterUser, setFaceRegisterUser] = useState<UserTeam | null>(null);
  const [assignAbsenceUser, setAssignAbsenceUser] = useState<UserTeam | null>(null);
  const [search, setSearch] = useState('');
  const [viewFilter, setViewFilter] = useState<'all' | 'leaders' | 'employees'>('all');

  const team = useQuery({
    queryKey: ['users', 'team'],
    queryFn: async () => {
      const res = await usersApi.team();
      return res.data;
    },
    enabled: !!auth.token,
  });

  const depts = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const res = await departmentsApi.list();
      return res.data;
    },
    enabled: !!auth.token,
  });

  const removeUser = useMutation({
    mutationFn: async (id: number) => {
      if (!confirm('Deseja realmente remover este colaborador?')) throw new Error('Cancelled');
      await usersApi.deleteEmployee(id);
    },
    onSuccess: async () => {
      toast.success('Colaborador removido.');
      await queryClient.invalidateQueries({ queryKey: ['users', 'team'] });
      await queryClient.invalidateQueries({ queryKey: ['departments'] });
      await queryClient.invalidateQueries({ queryKey: ['users', 'managers'] });
    },
    onError: (error: unknown) => {
      const err = error as { message: string };
      if (err.message !== 'Cancelled') toast.error('Erro ao remover colaborador.');
    },
  });

  const resetFace = useMutation({
    mutationFn: async (payload: { userId: number; userName: string }) => {
      const reason = window.prompt(`Motivo do reset biométrico para ${payload.userName}:`, 'Recadastro biométrico solicitado pelo RH.') ?? '';
      if (!reason.trim()) throw new Error('Cancelled');
      return authApi.resetFace(payload.userId, reason.trim());
    },
    onSuccess: async () => {
      toast.success('Biometria facial resetada. Faça um novo cadastro para o colaborador.');
      await queryClient.invalidateQueries({ queryKey: ['users', 'team'] });
      await queryClient.invalidateQueries({ queryKey: ['biometrics', 'summary'] });
    },
    onError: (error: unknown) => {
      const err = error as { message: string; response?: { data?: { error?: string } } };
      if (err.message !== 'Cancelled') {
        toast.error(err.response?.data?.error || 'Erro ao resetar a biometria facial.');
      }
    },
  });

  const toggleDept = (id: number) => {
    setExpandedDepts((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const openEditUser = (user: UserTeam) => {
    setEditingUser(user);
    setIsUserModalOpen(true);
  };

  const closeUserModal = () => {
    setEditingUser(null);
    setIsUserModalOpen(false);
  };

  const normalizedSearch = search.trim().toLowerCase();
  const noDeptUsers = (team.data as UserTeam[] | undefined)?.filter((user: UserTeam) => !user.department_id) || [];

  const filteredDepartments = useMemo(() => {
    const departments = (depts.data as DeptTeam[] | undefined) ?? [];
    return departments
      .map((dept: DeptTeam) => {
        const hierarchyLeaderIds = new Set((dept.hierarchy_levels ?? []).flatMap((level) => level.leaders.map((leader) => leader.user_id)));
        const hierarchyMatchesSearch = (dept.hierarchy_levels ?? []).some((level) =>
          level.name.toLowerCase().includes(normalizedSearch) || level.leaders.some((leader) =>
            leader.user?.name.toLowerCase().includes(normalizedSearch) || leader.user?.email.toLowerCase().includes(normalizedSearch)
          )
        );
        const users = (dept.users ?? []).filter((user: UserTeam) => {
          const matchesSearch =
            !normalizedSearch ||
            user.name.toLowerCase().includes(normalizedSearch) ||
            user.email.toLowerCase().includes(normalizedSearch) ||
            dept.name.toLowerCase().includes(normalizedSearch);
          const matchesRole =
            viewFilter === 'all' ||
            (viewFilter === 'leaders' && hierarchyLeaderIds.has(user.id)) ||
            (viewFilter === 'employees' && !hierarchyLeaderIds.has(user.id));
          return matchesSearch && matchesRole;
        });

        const departmentMatchesSearch = !normalizedSearch || dept.name.toLowerCase().includes(normalizedSearch);
        const hasVisibleHierarchy = viewFilter !== 'employees' && (!normalizedSearch || hierarchyMatchesSearch);
        return { ...dept, users, visible: departmentMatchesSearch || users.length > 0 || hasVisibleHierarchy };
      })
      .filter((dept: DeptTeam) => dept.visible);
  }, [depts.data, normalizedSearch, viewFilter]);

  const filteredNoDeptUsers = noDeptUsers.filter((user: UserTeam) => {
    const matchesSearch =
      !normalizedSearch ||
      user.name.toLowerCase().includes(normalizedSearch) ||
      user.email.toLowerCase().includes(normalizedSearch);
    const matchesRole =
      viewFilter === 'all' ||
      (viewFilter === 'leaders' && user.role === 'manager') ||
      (viewFilter === 'employees' && user.role === 'employee');
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#191717]">Colaboradores</h2>
          <p className="mt-2 text-sm text-[#6e6a6a]">Pesquise e gerencie os colaboradores da equipe.</p>
        </div>
        {canManageTeam && <div className="flex gap-2">
          <button onClick={() => { setEditingUser(null); setIsUserModalOpen(true); }} className="btn-primary">
            <Plus className="h-4 w-4" />
            Novo Colaborador
          </button>
        </div>}
      </div>

      <section className="surface-panel p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <div>
              <label className="field-label">Buscar por nome, email ou setor</label>
              <input className="field-input" placeholder="Ex: financeiro, joao, lider" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Visualização</label>
              <select className="field-input" value={viewFilter} onChange={(e) => setViewFilter(e.target.value as 'all' | 'leaders' | 'employees')}>
                <option value="all">Todos</option>
                <option value="leaders">Somente líderes</option>
                <option value="employees">Somente colaboradores</option>
              </select>
            </div>
          </div>
          <div className="flex items-end">
            <button className="btn-secondary w-full lg:w-auto" onClick={() => { setSearch(''); setViewFilter('all'); }}>
              Limpar filtros
            </button>
          </div>
        </div>
      </section>

      <div className="space-y-4">
        {depts.isLoading ? (
          <div className="surface-panel py-14 text-center text-[#6e6a6a]">Carregando setores...</div>
        ) : filteredDepartments.length === 0 && filteredNoDeptUsers.length === 0 ? (
          <div className="surface-panel py-16 text-center text-[#6e6a6a]">
            Nenhum resultado encontrado para os filtros aplicados.
          </div>
        ) : (
          filteredDepartments.map((dept: DeptTeam) => {
            const isExpanded = expandedDepts.includes(dept.id);
            const deptUsers = dept.users || [];
            const hierarchyLevels = dept.hierarchy_levels ?? [];
            const hierarchyLeaderIds = new Set(hierarchyLevels.flatMap((level) => level.leaders.map((leader) => leader.user_id)));
            const leaders = deptUsers.filter((user: UserTeam) => hierarchyLeaderIds.has(user.id));
            const employees = deptUsers.filter((user: UserTeam) => !hierarchyLeaderIds.has(user.id));
            const leaderCount = hierarchyLeaderIds.size;

            return (
              <div key={dept.id} className="surface-panel overflow-hidden">
                <div className="flex cursor-pointer items-center justify-between px-6 py-5 transition-colors hover:bg-[#f6f4f4]" onClick={() => toggleDept(dept.id)}>
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="h-5 w-5 text-[#6e6a6a]" /> : <ChevronRight className="h-5 w-5 text-[#6e6a6a]" />}
                    <div>
                      <h3 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.03em] text-[#191717]">
                        <Building className="h-5 w-5 text-[#026666]" />
                        {dept.name}
                      </h3>
                      <div className="mt-2 text-sm text-[#6e6a6a]">
                        {deptUsers.length} membro(s) · {leaderCount} líder(es) · {hierarchyLevels.length} nível(is)
                      </div>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="space-y-6 border-t border-[#ece8e8] bg-[#f8f6f6] p-6">
                    <section>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#026666]">Hierarquia de acesso</h4>
                        <span className="text-xs text-[#6e6a6a]">Do nível mais alto ao mais próximo do colaborador</span>
                      </div>
                      {hierarchyLevels.length === 0 ? (
                        <div className="surface-muted p-4 text-sm text-[#6e6a6a]">Nenhuma hierarquia configurada para este setor.</div>
                      ) : (
                        <div className="grid gap-3 xl:grid-cols-2">
                          {hierarchyLevels.map((level, levelIndex) => (
                            <div key={level.id ?? `${dept.id}-${levelIndex}`} className="rounded-xl border border-[#dcd7d7] bg-white p-4">
                              <div className="flex items-center gap-3">
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#026666] text-xs font-bold text-white">{levelIndex + 1}</span>
                                <div><div className="font-semibold text-[#191717]">{level.name}</div><div className="text-xs text-[#6e6a6a]">{level.leaders.length} responsável(is)</div></div>
                              </div>
                              <div className="mt-3 space-y-2">
                                {level.leaders.length === 0 ? (
                                  <div className="rounded-lg bg-[#f8f6f6] p-3 text-xs text-[#6e6a6a]">Sem responsável neste nível.</div>
                                ) : level.leaders.map((leader) => (
                                  <div key={leader.id ?? leader.user_id} className="rounded-lg bg-[#f8f6f6] p-3">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                      <div><div className="text-sm font-semibold text-[#191717]">{leader.user?.name ?? `Usuário #${leader.user_id}`}</div><div className="text-xs text-[#6e6a6a]">{leader.user?.email ?? 'E-mail não disponível'}{leader.user?.department_id !== dept.id ? ' · Líder de outro setor' : ''}</div></div>
                                      <span className="status-chip border-[#c8e7e7] bg-[#edf8f8] text-[#026666]">Nível {levelIndex + 1}</span>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {(leader.permissions as LeadershipPermission[]).map((permission) => <span key={permission} className="rounded-full border border-[#e2dddd] bg-white px-2 py-1 text-[10px] font-medium text-[#5f5a5a]">{permissionLabels[permission]}</span>)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                    {deptUsers.length === 0 ? (
                      <div className="py-8 text-center text-sm text-[#6e6a6a]">Nenhum colaborador neste setor.</div>
                    ) : (
                      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <div>
                          <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#6e6a6a]">Líderes do setor</h4>
                          {leaders.length === 0 ? (
                            <div className="surface-muted p-4 text-sm text-[#6e6a6a]">Sem líder definido</div>
                          ) : (
                            <div className="space-y-2">
                              {leaders.map((user: UserTeam) => (
                                <UserCard key={user.id} user={{ ...user, role: 'manager' } as unknown as Parameters<typeof UserCard>[0]['user']} onEdit={() => openEditUser(user)} onDelete={() => removeUser.mutate(user.id)} onRegisterFace={() => setFaceRegisterUser(user)} onResetFace={() => resetFace.mutate({ userId: user.id, userName: user.name })} onAssignAbsence={() => setAssignAbsenceUser(user)} />
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#6e6a6a]">Colaboradores do setor</h4>
                          {employees.length === 0 ? (
                            <div className="surface-muted p-4 text-sm text-[#6e6a6a]">Sem colaboradores</div>
                          ) : (
                            <div className="space-y-2">
                              {employees.map((user: UserTeam) => (
                                <UserCard key={user.id} user={{ ...user, role: 'employee' } as unknown as Parameters<typeof UserCard>[0]['user']} onEdit={() => openEditUser(user)} onDelete={() => removeUser.mutate(user.id)} onRegisterFace={() => setFaceRegisterUser(user)} onResetFace={() => resetFace.mutate({ userId: user.id, userName: user.name })} onAssignAbsence={() => setAssignAbsenceUser(user)} />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {filteredNoDeptUsers.length > 0 && (
          <div className="surface-panel mt-6 overflow-hidden">
            <div className="flex cursor-pointer items-center justify-between px-6 py-5 transition-colors hover:bg-[#f6f4f4]" onClick={() => toggleDept(0)}>
              <div className="flex items-center gap-3">
                {expandedDepts.includes(0) ? <ChevronDown className="h-5 w-5 text-[#6e6a6a]" /> : <ChevronRight className="h-5 w-5 text-[#6e6a6a]" />}
                <div>
                  <h3 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.03em] text-[#191717]">
                    <Users className="h-5 w-5 text-[#026666]" />
                    Base sem setor
                  </h3>
                  <div className="mt-2 text-sm text-[#6e6a6a]">
                    {filteredNoDeptUsers.length} membro(s)
                  </div>
                </div>
              </div>
            </div>

            {expandedDepts.includes(0) && (
              <div className="border-t border-[#ece8e8] bg-[#f8f6f6] p-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredNoDeptUsers.map((user: UserTeam) => (
                    <UserCard key={user.id} user={user as unknown as Parameters<typeof UserCard>[0]['user']} onEdit={() => openEditUser(user)} onDelete={() => removeUser.mutate(user.id)} onRegisterFace={() => setFaceRegisterUser(user)} onResetFace={() => resetFace.mutate({ userId: user.id, userName: user.name })} onAssignAbsence={() => setAssignAbsenceUser(user)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {isUserModalOpen && (
        <EmployeeFormModal
          user={editingUser}
          onClose={closeUserModal}
          onSuccess={async () => {
            await queryClient.invalidateQueries({ queryKey: ['users', 'team'] });
            await queryClient.invalidateQueries({ queryKey: ['departments'] });
            closeUserModal();
          }}
        />
      )}

      {faceRegisterUser && (
        <Suspense fallback={<div className="modal-shell"><div className="modal-card p-6 text-center">Carregando modulo de biometria...</div></div>}>
          <FaceRegistrationModal
            user={faceRegisterUser}
            onClose={() => setFaceRegisterUser(null)}
            onSuccess={async () => {
              await queryClient.invalidateQueries({ queryKey: ['users', 'team'] });
              setFaceRegisterUser(null);
              await queryClient.invalidateQueries({ queryKey: ['biometrics', 'summary'] });
            }}
          />
        </Suspense>
      )}

      {assignAbsenceUser && (
        <AssignAbsenceModal
          user={assignAbsenceUser as unknown as import('../../../services/usersApi').TeamUser}
          onClose={() => setAssignAbsenceUser(null)}
        />
      )}
    </div>
  );
}
