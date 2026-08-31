import { CalendarClock, Camera, Edit2, MapPin, RefreshCw, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

const normalizeWorkDays = (value: unknown): number[] => {
  if (Array.isArray(value)) return value.map(Number).filter((day) => day >= 0 && day <= 6);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(Number).filter((day) => day >= 0 && day <= 6) : [];
    } catch {
      return [];
    }
  }
  return [];
};

export default function UserCard({
  user,
  onEdit,
  onDelete,
  onRegisterFace,
  onResetFace,
  onAssignAbsence,
}: {
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
    work_type: string;
    status: string;
    has_biometric: boolean;
    biometric_sample_count?: number;
    remote_clock_in_enabled?: boolean;
    remote_clock_in_justification?: string;
    schedule?: {
      entry_time: string;
      exit_time: string;
      lunch_duration: number;
      work_days?: number[];
    };
  };
  onEdit: () => void;
  onDelete: () => void;
  onRegisterFace: () => void;
  onResetFace: () => void;
  onAssignAbsence?: () => void;
}) {
  const auth = useAuthStore();
  const permissions = auth.user?.leadership_permissions ?? [];
  const canManageTeam = auth.user?.role === 'admin' || permissions.includes('manage_team');
  const canManageBiometrics = auth.user?.role === 'admin' || permissions.includes('manage_biometrics');
  const canManageRecords = auth.user?.role === 'admin' || permissions.includes('manage_time_records');
  const workDayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
  const workDays = normalizeWorkDays(user.schedule?.work_days);

  return (
    <div className="flex items-center justify-between border border-[#e7e4e4] bg-white p-4 shadow-[0_8px_24px_rgba(25,23,23,0.05)] transition-shadow hover:shadow-[0_12px_28px_rgba(25,23,23,0.08)]">
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 items-center justify-center text-xs font-bold ${
          user.role === 'manager' ? 'bg-[#dff3f3] text-[#026666]' :
          user.role === 'admin' ? 'bg-[#ede7e7] text-[#191717]' : 'bg-[#eff6f6] text-[#026666]'
        }`}>
          {user.name.substring(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="text-sm font-semibold text-[#191717]">{user.name}</div>
          <div className="mt-1 text-xs text-[#6e6a6a]">{user.email}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`status-chip ${
              user.role === 'manager'
                ? 'border-[#c8e7e7] bg-[#edf8f8] text-[#026666]'
                : 'border-[#e8e4e4] bg-[#f6f4f4] text-[#191717]'
            }`}>
              {user.role === 'manager' ? 'Lider' : 'Colaborador'}
            </span>
            <span className="text-[11px] uppercase tracking-[0.16em] text-[#8a8585]">
              {user.work_type === 'presential' ? 'Presencial' : user.work_type === 'remote' ? 'Home Office' : 'Hibrido'}
            </span>
            <span className={`status-chip ${user.status === 'active' ? 'border-[#dceaea] bg-[#edf8f8] text-[#026666]' : 'border-[#f0dede] bg-[#fbf1f1] text-[#b43737]'}`}>
              {user.status === 'active' ? 'Ativo' : 'Inativo'}
            </span>
            <span className={`status-chip ${user.has_biometric ? 'border-[#dceaea] bg-[#edf8f8] text-[#026666]' : 'border-[#ece8e8] bg-[#f6f4f4] text-[#191717]'}`}>
              {user.has_biometric ? `Face ${user.biometric_sample_count ?? 0}` : 'Sem face'}
            </span>
            {user.remote_clock_in_enabled && (
              <span className="status-chip border-[#c8e7e7] bg-[#edf8f8] text-[#026666]" title={user.remote_clock_in_justification || 'Liberado para bater ponto remoto'}>
                <MapPin className="h-3 w-3" /> Ponto remoto
              </span>
            )}
          </div>
          {user.schedule && (
            <div className="mt-2 text-xs text-[#6e6a6a]">
              Jornada: {user.schedule.entry_time} às {user.schedule.exit_time} - almoço {user.schedule.lunch_duration} min
              {workDays.length ? ` • dias ${workDays.map((day) => workDayLabels[day] || day).join(', ')}` : ''}
            </div>
          )}
        </div>
      </div>

      {(canManageTeam || canManageBiometrics || canManageRecords) && (
        <div className="flex items-center gap-1">
          {onAssignAbsence && canManageRecords && (
            <button onClick={onAssignAbsence} className="btn-ghost" title="Lançar folga/férias">
              <CalendarClock className="h-3.5 w-3.5" />
            </button>
          )}
          {canManageBiometrics && <button onClick={onRegisterFace} className="btn-ghost" title="Cadastrar Face">
            <Camera className="h-3.5 w-3.5" />
          </button>}
          {user.has_biometric && canManageBiometrics && (
            <button onClick={onResetFace} className="btn-ghost" title="Resetar Biometria">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
          {canManageTeam && (
            <>
              <button onClick={onEdit} className="btn-ghost" title="Editar">
                <Edit2 className="h-3.5 w-3.5" />
              </button>
              <button onClick={onDelete} className="btn-ghost" title="Excluir">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
