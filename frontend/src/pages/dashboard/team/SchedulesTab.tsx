import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock3 } from 'lucide-react';
import { usersApi } from '../../../services/usersApi';

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

export default function SchedulesTab() {
  const team = useQuery({
    queryKey: ['users', 'team'],
    queryFn: async () => {
      const res = await usersApi.team();
      return res.data;
    },
  });

  const schedules = useMemo(() => {
    if (!team.data) return [];
    
    interface ScheduleGroup {
      id: number;
      entry_time: string;
      exit_time: string;
      lunch_duration: number;
      flexible_lunch: boolean;
      work_days: number[];
      custom_workload?: Record<number, number> | null;
      usersCount: number;
    }

    // Agrupar usuários pela mesma jornada (baseado nos horários)
    const map = new Map<string, ScheduleGroup>();
    
    team.data.forEach((user: { schedule?: { id: number; entry_time: string; exit_time: string; lunch_duration: number; flexible_lunch: boolean; work_days: unknown; custom_workload?: Record<number, number> | null } }) => {
      if (!user.schedule) return;
      const key = `${user.schedule.entry_time}-${user.schedule.exit_time}-${user.schedule.lunch_duration}-${user.schedule.flexible_lunch}-${JSON.stringify(user.schedule.custom_workload || {})}`;
      const workDays = normalizeWorkDays(user.schedule.work_days);
      
      if (!map.has(key)) {
        map.set(key, {
          id: user.schedule.id,
          entry_time: user.schedule.entry_time.slice(0, 5),
          exit_time: user.schedule.exit_time.slice(0, 5),
          lunch_duration: user.schedule.lunch_duration,
          flexible_lunch: user.schedule.flexible_lunch,
          work_days: workDays,
          custom_workload: user.schedule.custom_workload,
          usersCount: 1,
        });
      } else {
        const existing = map.get(key);
        if (existing) {
          existing.usersCount += 1;
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => a.entry_time.localeCompare(b.entry_time));
  }, [team.data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#191717]">Jornadas e Escalas</h2>
          <p className="mt-2 text-sm text-[#6e6a6a]">Visão consolidada das jornadas de trabalho atribuídas à equipe.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {team.isLoading ? (
          <div className="col-span-full py-12 text-center text-[#6e6a6a]">Carregando jornadas...</div>
        ) : schedules.length === 0 ? (
          <div className="col-span-full surface-panel py-16 text-center text-[#6e6a6a]">
            Nenhuma jornada configurada.
          </div>
        ) : (
          schedules.map((schedule, idx) => (
            <div key={idx} className="surface-panel flex flex-col justify-between p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f8f6f6]">
                    <Clock3 className="h-5 w-5 text-[#026666]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[#191717]">
                      {schedule.entry_time} às {schedule.exit_time}
                    </h3>
                    <p className="text-sm text-[#6e6a6a]">
                      {schedule.usersCount} colaborador(es)
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-6 border-t border-[#ece8e8] pt-4 text-sm text-[#6e6a6a]">
                <div className="flex justify-between">
                  <span>Almoço:</span>
                  <span className="font-medium text-[#191717]">{schedule.lunch_duration} min {schedule.flexible_lunch ? '(Flexível)' : ''}</span>
                </div>
                <div className="mt-2 flex justify-between">
                  <span>Dias:</span>
                  <span className="font-medium text-[#191717]">{schedule.work_days?.length || 5} dias na semana</span>
                </div>
                {schedule.custom_workload && Object.keys(schedule.custom_workload).length > 0 && (
                  <div className="mt-2 text-xs text-[#026666] font-medium bg-[#edf8f8] px-2 py-1 inline-block rounded">
                    Possui cargas diárias customizadas
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      
      <div className="surface-panel mt-8 p-6 bg-[#fcfbfb]">
        <h4 className="text-sm font-semibold text-[#191717]">Nota sobre Jornadas</h4>
        <p className="mt-2 text-sm text-[#6e6a6a]">
          Atualmente, as jornadas são configuradas individualmente no cadastro de cada colaborador.
          A centralização de modelos de escala para vinculação em massa estará disponível em breve.
        </p>
      </div>
    </div>
  );
}
