import { useState, useEffect, useMemo } from 'react';
import { Check } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../../stores/authStore';
import { usersApi } from '../../../services/usersApi';
import { departmentsApi } from '../../../services/departmentsApi';

const _weekDayOptions = [
  { label: 'Dom', value: 0 },
  { label: 'Seg', value: 1 },
  { label: 'Ter', value: 2 },
  { label: 'Qua', value: 3 },
  { label: 'Qui', value: 4 },
  { label: 'Sex', value: 5 },
  { label: 'Sab', value: 6 },
];

const normalizeWorkDays = (value: unknown): number[] => {
  if (Array.isArray(value)) return value.map(Number).filter((day) => day >= 0 && day <= 6);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(Number).filter((day) => day >= 0 && day <= 6) : [1, 2, 3, 4, 5];
    } catch {
      return [1, 2, 3, 4, 5];
    }
  }
  return [1, 2, 3, 4, 5];
};

interface UserFormProps {
  id?: number;
  name?: string;
  cpf?: string;
  email?: string;
  role?: string;
  work_type?: string;
  manager_id?: number | null;
  department_id?: number | null;
  pin_code?: string | null;
  status?: string;
  schedule?: {
    entry_time?: string | Date;
    exit_time?: string | Date;
    lunch_duration?: number;
    flexible_lunch?: boolean;
    work_days?: number[] | string;
    custom_workload?: Record<number, number> | null;
  };
  remote_clock_in_enabled?: boolean;
  remote_clock_in_justification?: string | null;
  hire_date?: string;
  requires_time_tracking?: boolean;
}

export default function EmployeeFormModal({ user, onClose, onSuccess }: { user?: UserFormProps; onClose: () => void; onSuccess: () => void }) {
  const auth = useAuthStore();
  const [userForm, setUserForm] = useState({
    name: user?.name || '',
    cpf: user?.cpf || '',
    email: user?.email || '',
    password: '',
    work_type: user?.work_type || 'presential',
    role: user?.role === 'admin' ? 'manager' : (user?.role || 'employee'),
    manager_id: user?.manager_id || '',
    department_id: user?.department_id || '',
    pin_code: user?.pin_code || '',
    status: user?.status || 'active',
    use_custom_schedule: Boolean(user?.schedule),
    custom_entry_time: user?.schedule?.entry_time ? String(user.schedule.entry_time).slice(0, 5) : '09:00',
    custom_exit_time: user?.schedule?.exit_time ? String(user.schedule.exit_time).slice(0, 5) : '18:00',
    custom_lunch_duration: String(user?.schedule?.lunch_duration ?? 60),
    custom_flexible_lunch: user?.schedule?.flexible_lunch ?? true,
    custom_work_days: normalizeWorkDays(user?.schedule?.work_days),
    custom_workload: (() => {
      const cw = user?.schedule?.custom_workload;
      if (!cw) return {};
      if (typeof cw === 'string') {
        try { return JSON.parse(cw); } catch { return {}; }
      }
      return cw;
    })(),
    remote_clock_in_enabled: user?.remote_clock_in_enabled ?? false,
    remote_clock_in_justification: user?.remote_clock_in_justification || '',
    hire_date: user?.hire_date || '',
    requires_time_tracking: user?.requires_time_tracking ?? true,
  });

  useEffect(() => {
    if (user) {
      setUserForm({
        name: user.name || '',
        cpf: user.cpf || '',
        email: user.email || '',
        password: '',
        work_type: user.work_type || 'presential',
        role: user.role === 'admin' ? 'manager' : (user.role || 'employee'),
        manager_id: user.manager_id || '',
        department_id: user.department_id || '',
        pin_code: user.pin_code || '',
        status: user.status || 'active',
        use_custom_schedule: Boolean(user.schedule),
        custom_entry_time: user.schedule?.entry_time ? String(user.schedule.entry_time).slice(0, 5) : '09:00',
        custom_exit_time: user.schedule?.exit_time ? String(user.schedule.exit_time).slice(0, 5) : '18:00',
        custom_lunch_duration: String(user.schedule?.lunch_duration ?? 60),
        custom_flexible_lunch: user.schedule?.flexible_lunch ?? true,
        custom_work_days: normalizeWorkDays(user.schedule?.work_days),
        custom_workload: (() => {
          const cw = user.schedule?.custom_workload;
          if (!cw) return {};
          if (typeof cw === 'string') {
            try { return JSON.parse(cw); } catch { return {}; }
          }
          return cw;
        })(),
        remote_clock_in_enabled: user.remote_clock_in_enabled ?? false,
        remote_clock_in_justification: user.remote_clock_in_justification || '',
        hire_date: user.hire_date || '',
        requires_time_tracking: user.requires_time_tracking ?? true,
      });
    }
  }, [user]);

  const depts = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const res = await departmentsApi.list();
      return res.data;
    },
    enabled: !!auth.token && (auth.user?.role === 'manager' || auth.user?.role === 'admin'),
  });

  const managers = useQuery({
    queryKey: ['users', 'managers'],
    queryFn: async () => {
      const res = await usersApi.managers();
      return res.data;
    },
    enabled: !!auth.token && auth.user?.role === 'admin',
  });

  const passwordRequirements = useMemo(() => [
    { label: '8 a 72 caracteres', valid: userForm.password.length >= 8 && userForm.password.length <= 72 },
    { label: 'Uma letra maiúscula', valid: /[A-Z]/.test(userForm.password) },
    { label: 'Uma letra minúscula', valid: /[a-z]/.test(userForm.password) },
    { label: 'Um número', valid: /[0-9]/.test(userForm.password) },
  ], [userForm.password]);
  const hasValidNewPassword = passwordRequirements.every((requirement) => requirement.valid);
  const passwordIsValid = user ? userForm.password.length === 0 || hasValidNewPassword : hasValidNewPassword;

  const canSaveUser =
    userForm.name.trim().length >= 3 &&
    userForm.email.trim().length >= 5 &&
    (user || userForm.cpf.trim().length >= 11) &&
    passwordIsValid &&
    (!userForm.requires_time_tracking || !userForm.remote_clock_in_enabled || userForm.remote_clock_in_justification.trim().length > 5);

  const saveUser = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: userForm.name,
        email: userForm.email,
        work_type: userForm.work_type,
        role: auth.user?.role === 'admin' ? userForm.role : user?.role || 'employee',
        manager_id: auth.user?.role === 'admin' && userForm.manager_id ? Number(userForm.manager_id) : user?.manager_id || null,
        department_id: auth.user?.role === 'admin' ? (userForm.department_id ? Number(userForm.department_id) : null) : user?.department_id || auth.user?.department_id || null,
        status: userForm.status,
        requires_time_tracking: userForm.requires_time_tracking,
        remote_clock_in_enabled: userForm.requires_time_tracking && Boolean(userForm.remote_clock_in_enabled),
        remote_clock_in_justification: userForm.requires_time_tracking && userForm.remote_clock_in_enabled ? userForm.remote_clock_in_justification : null,
        hire_date: userForm.hire_date || null,
      };

      if (!user || userForm.pin_code.trim()) {
        payload.pin_code = userForm.pin_code.trim() ? userForm.pin_code.trim() : null;
      }

      payload.work_schedule = userForm.use_custom_schedule
        ? {
            entry_time: userForm.custom_entry_time,
            exit_time: userForm.custom_exit_time,
            lunch_duration: Number(userForm.custom_lunch_duration || 0),
            flexible_lunch: userForm.custom_flexible_lunch,
            work_days: userForm.custom_work_days,
            custom_workload: Object.keys(userForm.custom_workload).length > 0 ? userForm.custom_workload : null,
          }
        : null;

      // Ensure custom_workload is stringified properly when sent to the API
      if (payload.work_schedule && typeof payload.work_schedule === 'object' && 'custom_workload' in payload.work_schedule) {
        // do nothing, we send it as an object
      }

      if (userForm.password) payload.password = userForm.password;

      if (user) {
        if (!user.id) throw new Error('ID do usuário não encontrado');
        return usersApi.updateEmployee(user.id, payload as Parameters<typeof usersApi.updateEmployee>[1]);
      }

      payload.cpf = userForm.cpf;
      payload.registration_number = Math.floor(Math.random() * 1000000).toString();
      return usersApi.createEmployee(payload as Parameters<typeof usersApi.createEmployee>[0]);
    },
    onSuccess: async () => {
      toast.success(user ? 'Colaborador atualizado.' : 'Colaborador cadastrado.');
      onSuccess();
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { error?: string } } };
      toast.error(apiError.response?.data?.error || 'Erro ao salvar colaborador.');
    },
  });

  return (
    <div className="modal-shell">
      <div className="modal-card max-h-[92vh] max-w-3xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#ece8e8] bg-[#fcfbfb]/95 px-6 py-5 backdrop-blur-sm">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#026666]">Cadastro operacional</div>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#191717]">{user ? 'Editar usuário' : 'Novo usuário'}</h3>
          </div>
          <button onClick={onClose} className="btn-ghost">✕</button>
        </div>

        <div className="space-y-7 p-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="field-label">Nome completo</label>
              <input className="field-input" placeholder="Ex: João da Silva" value={userForm.name} onChange={(e) => setUserForm((state) => ({ ...state, name: e.target.value }))} />
            </div>

            {!user && (
              <div className="space-y-1.5">
                <label className="field-label">CPF</label>
                <input className="field-input" placeholder="000.000.000-00" value={userForm.cpf} onChange={(e) => setUserForm((state) => ({ ...state, cpf: e.target.value }))} />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="field-label">E-mail corporativo</label>
              <input className="field-input" placeholder="joao@empresa.com" value={userForm.email} onChange={(e) => setUserForm((state) => ({ ...state, email: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <label className="field-label">{user ? 'Nova senha' : 'Senha inicial'}</label>
              <input className="field-input" type="password" autoComplete="new-password" maxLength={72} placeholder={user ? 'Deixe em branco para manter a senha atual' : 'Crie uma senha segura'} value={userForm.password} onChange={(e) => setUserForm((state) => ({ ...state, password: e.target.value }))} />
              {(!user || userForm.password.length > 0) && (
                <div className="mt-2 grid grid-cols-1 gap-1.5 rounded-xl border border-[#ebe8e8] bg-[#f8f6f6] p-3 sm:grid-cols-2">
                  {passwordRequirements.map((requirement) => (
                    <div key={requirement.label} className={`flex items-center gap-1.5 text-[11px] font-medium ${requirement.valid ? 'text-[#026666]' : 'text-[#8b8686]'}`}>
                      <Check className="h-3.5 w-3.5" />
                      {requirement.label}
                    </div>
                  ))}
                </div>
              )}
              {user && userForm.password.length === 0 && <p className="mt-1 text-xs text-[#6e6a6a]">A senha já cadastrada não será alterada.</p>}
            </div>

            <div className="space-y-1.5">
              <label className="field-label">Modalidade de trabalho</label>
              <select className="field-input" value={userForm.work_type} onChange={(e) => setUserForm((state) => ({ ...state, work_type: e.target.value }))}>
                <option value="presential">Presencial</option>
                <option value="hybrid">Híbrido</option>
                <option value="remote">Home Office</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="field-label">PIN do totem</label>
              <input className="field-input" inputMode="numeric" pattern="[0-9]*" placeholder={user ? 'Deixe em branco para manter' : '4 a 10 dígitos'} value={userForm.pin_code} onChange={(e) => setUserForm((state) => ({ ...state, pin_code: e.target.value.replace(/\D/g, '').slice(0, 10) }))} />
            </div>

            <div className="space-y-1.5">
              <label className="field-label">Status</label>
              <select className="field-input" value={userForm.status} onChange={(e) => setUserForm((state) => ({ ...state, status: e.target.value as 'active' | 'inactive' }))}>
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="field-label">Data de Admissão / Início do Banco de Horas</label>
              <input
                type="date"
                min="1900-01-01"
                className="field-input"
                value={userForm.hire_date}
                onChange={(e) => setUserForm((state) => ({ ...state, hire_date: e.target.value }))}
              />
              <p className="mt-1 text-xs text-[#6e6a6a]">Dias anteriores a esta data ficam fora de todos os cálculos do banco de horas, sem crédito ou débito.</p>
            </div>
          </div>

          {auth.user?.role === 'admin' && <div className="border-t border-[#ece8e8] pt-6">
            <div className={`rounded-[14px] border p-4 ${userForm.requires_time_tracking ? 'border-[#b9dede] bg-[#edf8f8]' : 'border-[#e2dddd] bg-[#f6f4f4]'}`}>
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" className="mt-1 h-4 w-4 rounded border-[#c8c3c3] text-[#026666] focus:ring-[#026666]" checked={userForm.requires_time_tracking} onChange={(event) => setUserForm((state) => ({ ...state, requires_time_tracking: event.target.checked, remote_clock_in_enabled: event.target.checked ? state.remote_clock_in_enabled : false }))} />
                <span><span className="block text-sm font-semibold text-[#191717]">Controla ponto</span><span className="mt-1 block text-xs leading-5 text-[#6e6a6a]">Quando desativado, o usuário não aparece no totem e fica fora de jornadas, atrasos, ausências, banco de horas, pendências e relatórios de ponto.</span></span>
              </label>
            </div>
          </div>}

          <div className={`space-y-4 border-t border-[#ece8e8] pt-6 ${userForm.requires_time_tracking ? '' : 'pointer-events-none opacity-45'}`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#026666]">Jornada</div>
                <div className="mt-1 text-sm text-[#6e6a6a]">Defina uma jornada customizada quando o colaborador não seguir a escala padrão.</div>
              </div>
              <label className="flex items-center gap-2 text-sm text-[#191717]">
                <input type="checkbox" checked={userForm.use_custom_schedule} onChange={(e) => setUserForm((state) => ({ ...state, use_custom_schedule: e.target.checked }))} />
                Usar jornada customizada
              </label>
            </div>

            {userForm.use_custom_schedule && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5">
                    <label className="field-label">Entrada (Padrão)</label>
                    <input type="time" className="field-input" value={userForm.custom_entry_time} onChange={(e) => setUserForm((state) => ({ ...state, custom_entry_time: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="field-label">Saída (Padrão)</label>
                    <input type="time" className="field-input" value={userForm.custom_exit_time} onChange={(e) => setUserForm((state) => ({ ...state, custom_exit_time: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="field-label">Almoço (min)</label>
                    <input type="number" min="0" max="240" className="field-input" value={userForm.custom_lunch_duration} onChange={(e) => setUserForm((state) => ({ ...state, custom_lunch_duration: e.target.value }))} />
                  </div>
                  <label className="flex items-end gap-2 pb-3 text-sm text-[#191717]">
                    <input type="checkbox" checked={userForm.custom_flexible_lunch} onChange={(e) => setUserForm((state) => ({ ...state, custom_flexible_lunch: e.target.checked }))} />
                    Almoço flexível
                  </label>
                </div>
                
                <div className="space-y-2 mt-4">
                  {/* <div className="bg-red-100 p-2 text-xs">DEBUG: {JSON.stringify(userForm.custom_workload)}</div> */}
                  <label className="field-label">Dias trabalhados na semana e Carga Horária Específica</label>
                  <p className="text-xs text-[#6e6a6a]">Selecione os dias e, se necessário, preencha uma carga horária específica para o dia (ex: Sexta-feira = 480 min para 8h de trabalho). Deixe em branco para usar o cálculo padrão de Entrada/Saída.</p>
                  <div className="flex flex-wrap gap-3">
                    {[
                      { id: 1, label: 'Seg', name: 'Segunda-feira' },
                      { id: 2, label: 'Ter', name: 'Terça-feira' },
                      { id: 3, label: 'Qua', name: 'Quarta-feira' },
                      { id: 4, label: 'Qui', name: 'Quinta-feira' },
                      { id: 5, label: 'Sex', name: 'Sexta-feira' },
                      { id: 6, label: 'Sáb', name: 'Sábado' },
                      { id: 0, label: 'Dom', name: 'Domingo' },
                    ].map((day) => (
                      <div key={day.id} className="flex flex-col gap-2 p-3 border border-[#ece8e8] rounded-lg bg-white w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.75rem)]">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={userForm.custom_work_days.includes(day.id)}
                            onChange={(e) => {
                              const newDays = e.target.checked
                                ? [...userForm.custom_work_days, day.id].sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b))
                                : userForm.custom_work_days.filter((d) => d !== day.id);
                              setUserForm((state) => ({ ...state, custom_work_days: newDays }));
                            }}
                            className="rounded border-[#ece8e8] text-[#026666] focus:ring-[#026666]"
                          />
                          <span className="text-sm font-medium text-[#191717]">{day.name}</span>
                        </label>
                        {userForm.custom_work_days.includes(day.id) && (
                          <div className="pl-6">
                            <input
                              type="number"
                              min="0"
                              placeholder="Minutos (ex: 480 para 8h)"
                              className="field-input text-xs"
                              value={(userForm.custom_workload as Record<string, number>)[day.id] ?? (userForm.custom_workload as Record<string, number>)[String(day.id)] ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setUserForm((state) => {
                                  const updated = { ...state.custom_workload } as Record<string, number>;
                                  if (!val) {
                                    delete updated[String(day.id)];
                                  } else {
                                    updated[String(day.id)] = Number(val);
                                  }
                                  return { ...state, custom_workload: updated };
                                });
                              }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>


              </div>
            )}
          </div>

          {(auth.user?.role === 'admin' || auth.user?.role === 'manager') && (
            <div className="mt-2 grid grid-cols-1 gap-5 border-t border-[#ece8e8] pt-6 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <label className="field-label">Setor</label>
                <select 
                  className="field-input" 
                  value={userForm.department_id} 
                  onChange={(e) => setUserForm((state) => ({ ...state, department_id: e.target.value }))}
                  disabled={auth.user?.role === 'manager'}
                >
                  <option value="">Nenhum</option>
                  {depts.data?.map((dept: { id: number; name: string }) => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>

              {auth.user?.role === 'admin' && (
                <>
                  <div className="space-y-1.5">
                    <label className="field-label">Perfil de acesso</label>
                    <select className="field-input" value={userForm.role} onChange={(e) => setUserForm((state) => ({ ...state, role: e.target.value as 'employee' | 'manager', manager_id: '' }))}>
                      <option value="employee">Colaborador Padrão</option>
                      <option value="manager">Líder / Gestor</option>
                    </select>
                  </div>

                  {userForm.role === 'employee' && (
                    <div className="space-y-1.5">
                      <label className="field-label">Líder responsável</label>
                      <select className="field-input" value={userForm.manager_id} onChange={(e) => setUserForm((state) => ({ ...state, manager_id: e.target.value }))}>
                        <option value="">Nenhum</option>
                        {managers.data?.map((manager: { id: number; name: string }) => (
                          <option key={manager.id} value={manager.id}>{manager.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className={`mt-6 border-t border-[#ece8e8] pt-6 ${userForm.requires_time_tracking ? '' : 'pointer-events-none opacity-45'}`}>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#026666]">Ponto Remoto e GPS</div>
            <div className="mt-4 space-y-4">
              <label className="flex items-center gap-2 text-sm text-[#191717] cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={userForm.remote_clock_in_enabled} 
                  onChange={(e) => setUserForm(s => ({ ...s, remote_clock_in_enabled: e.target.checked }))} 
                  className="w-4 h-4 text-[#026666] border-[#ece8e8] rounded focus:ring-[#026666]" 
                />
                Permitir marcação de ponto via GPS / Web
              </label>
              {userForm.remote_clock_in_enabled && (
                <div className="pl-6 space-y-1.5">
                  <label className="field-label">Justificativa da Liberação (Obrigatório)</label>
                  <input 
                    className="field-input" 
                    placeholder="Ex: Colaborador atua em modelo home-office..." 
                    value={userForm.remote_clock_in_justification} 
                    onChange={(e) => setUserForm(s => ({ ...s, remote_clock_in_justification: e.target.value }))} 
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#ece8e8] bg-[#fcfbfb]/95 px-6 py-4 backdrop-blur-sm">
          <button onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
          <button onClick={() => saveUser.mutate()} disabled={saveUser.isPending || !canSaveUser} className="btn-primary">
            {saveUser.isPending ? 'Salvando...' : 'Salvar cadastro'}
          </button>
        </div>
      </div>
    </div>
  );
}
