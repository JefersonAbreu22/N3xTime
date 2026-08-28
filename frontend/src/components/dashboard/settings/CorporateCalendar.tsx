import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Calendar as CalendarIcon, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../../stores/authStore';
import { holidaysApi } from '../../../services/holidaysApi';
import { todayKey } from '../dashboardUtils';

export default function CorporateCalendar() {
  const auth = useAuthStore();
  const queryClient = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });
  const [holidayForm, setHolidayForm] = useState({
    name: '',
    holiday_date: todayKey(),
    is_paid: true,
  });

  const holidays = useQuery({
    queryKey: ['holidays'],
    queryFn: holidaysApi.list,
    enabled: auth.user?.role === 'admin' || auth.user?.role === 'manager',
  });

  const createHoliday = useMutation({
    mutationFn: async () => holidaysApi.create(holidayForm),
    onSuccess: (response) => {
      toast.success(response.message || 'Feriado/Folga cadastrado.');
      setHolidayForm({ name: '', holiday_date: todayKey(), is_paid: true });
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      queryClient.invalidateQueries({ queryKey: ['reports', 'hr-summary'] });
      queryClient.invalidateQueries({ queryKey: ['reports', 'attendance'] });
      queryClient.invalidateQueries({ queryKey: ['reports', 'cumulative-bank-hours'] });
      queryClient.invalidateQueries({ queryKey: ['my-point'] });
      queryClient.invalidateQueries({ queryKey: ['overview', 'hr-summary'] });
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || 'Não foi possível cadastrar.');
    },
  });

  const deleteHoliday = useMutation({
    mutationFn: async (id: number) => holidaysApi.remove(id),
    onSuccess: (response) => {
      toast.success(response.message || 'Removido com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      queryClient.invalidateQueries({ queryKey: ['reports', 'hr-summary'] });
      queryClient.invalidateQueries({ queryKey: ['reports', 'attendance'] });
      queryClient.invalidateQueries({ queryKey: ['reports', 'cumulative-bank-hours'] });
      queryClient.invalidateQueries({ queryKey: ['my-point'] });
      queryClient.invalidateQueries({ queryKey: ['overview', 'hr-summary'] });
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || 'Não foi possível remover.');
    },
  });

  const buildMonthPreview = () => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;

    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);
    
    let totalDays = 0;
    let workingDays = 0;
    let weekendDays = 0;
    let paidHolidayDaysCount = 0;
    let unpaidHolidayDaysCount = 0;

    const days = [];
    const holidayMap = new Map(holidays.data?.data.map((holiday) => [holiday.holiday_date, holiday] as const) || []);

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayOfWeek = d.getDay(); // 0 = Dom, 6 = Sáb
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const holiday = holidayMap.get(dateKey);
      const isHoliday = Boolean(holiday);
      const isPaidHoliday = Boolean(holiday?.is_paid);
      
      totalDays++;
      if (isPaidHoliday) {
        paidHolidayDaysCount++;
      } else if (isWeekend) {
        weekendDays++;
      } else {
        workingDays++;
      }

      if (isHoliday && !isPaidHoliday) unpaidHolidayDaysCount++;

      days.push({
        dateKey,
        dateObj: new Date(d),
        isWeekend,
        isHoliday,
        isPaidHoliday,
        dayOfWeek,
      });
    }

    return { totalDays, workingDays, weekendDays, paidHolidayDaysCount, unpaidHolidayDaysCount, days };
  };

  const preview = buildMonthPreview();
  const currentMonthHolidays = holidays.data?.data.filter(h => h.holiday_date.startsWith(selectedMonth)) || [];

  return (
    <div className="surface-panel p-6">
      <div className="mb-5 flex flex-col gap-3 border-b border-[#ece8e8] pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#026666]">Feriados e Dias Não Úteis</div>
          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#191717]">Calendário Corporativo</h3>
        </div>
        <div className="text-sm text-[#6e6a6a]">Base utilizada nos cálculos automáticos do banco de horas da empresa.</div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-4">
            <h4 className="font-semibold text-[#191717] flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-[#026666]" />
              Visualização de Dias Úteis
            </h4>
            <p className="text-sm text-[#6e6a6a] mt-1">Selecione o mês para prever o cálculo automático do sistema.</p>
          </div>

          <div className="mb-4">
            <input 
              type="month" 
              className="field-input w-48" 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)} 
            />
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="rounded-xl border border-[#dceaea] bg-[#edf8f8] p-4 text-[#026666]">
              <div className="text-2xl font-semibold">{preview.workingDays}</div>
              <div className="text-sm mt-1">Dias Úteis (Padrão)</div>
            </div>
            <div className="rounded-xl border border-[#ece8e8] bg-[#fcfbfb] p-4 text-[#6e6a6a]">
              <div className="text-2xl font-semibold">{preview.weekendDays}</div>
              <div className="text-sm mt-1">Finais de Semana</div>
            </div>
            <div className="rounded-xl border border-[#f0dede] bg-[#fbf1f1] p-4 text-[#b43737]">
              <div className="text-2xl font-semibold">{preview.paidHolidayDaysCount}</div>
              <div className="text-sm mt-1">Feriados remunerados</div>
            </div>
            <div className="rounded-xl border border-[#eadfc4] bg-[#fff9eb] p-4 text-[#8a6414]">
              <div className="text-2xl font-semibold">{preview.unpaidHolidayDaysCount}</div>
              <div className="text-sm mt-1">Não remunerados (mantêm carga)</div>
            </div>
            <div className="rounded-xl border border-[#ece8e8] bg-[#f6f4f4] p-4 text-[#191717]">
              <div className="text-2xl font-semibold">{preview.totalDays}</div>
              <div className="text-sm mt-1">Total do Mês</div>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg bg-[#fcfbfb] p-3 border border-[#ece8e8] text-sm text-[#6e6a6a]">
            <Info className="w-5 h-5 text-[#026666] shrink-0 mt-0.5" />
            <p>
              <strong>Remunerado:</strong> retira a carga prevista e não gera déficit; se houver trabalho, as horas viram crédito de feriado. <strong>Não remunerado:</strong> mantém a carga prevista; sem trabalho, o período gera déficit normalmente.
            </p>
          </div>
        </div>

        <div>
          <div className="mb-4">
            <h4 className="font-semibold text-[#191717]">Gerenciar Datas (Geral)</h4>
            <p className="text-sm text-[#6e6a6a] mt-1">Adicione feriados nacionais, municipais ou dias não úteis globais.</p>
          </div>

          <div className="grid gap-3 mb-6 p-4 rounded-xl border border-[#ece8e8] bg-[#fcfbfb]">
            <div>
              <label className="field-label text-xs">Nome do feriado / evento</label>
              <input className="field-input" placeholder="Ex: Proclamação da República" value={holidayForm.name} onChange={(e) => setHolidayForm((state) => ({ ...state, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label text-xs">Data</label>
                <input type="date" min="1900-01-01" className="form-control field-input" value={holidayForm.holiday_date} onChange={(e) => setHolidayForm((state) => ({ ...state, holiday_date: e.target.value }))} />
              </div>
              <div className="flex flex-col justify-end pb-1">
                <label className="flex items-center gap-2 text-sm text-[#191717] cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 text-[#026666]" checked={holidayForm.is_paid} onChange={(e) => setHolidayForm((state) => ({ ...state, is_paid: e.target.checked }))} />
                  Feriado remunerado
                </label>
                <div className="mt-1 text-xs text-[#6e6a6a]">Desmarcado, mantém a carga prevista e pode gerar déficit.</div>
              </div>
            </div>
            <div className="mt-2">
              <button onClick={() => createHoliday.mutate()} disabled={auth.user?.role !== 'admin' || createHoliday.isPending || holidayForm.name.trim().length < 2} className="btn-secondary w-full">
                {createHoliday.isPending ? 'Salvando...' : 'Adicionar ao Calendário'}
              </button>
            </div>
          </div>

          <div>
            <h5 className="font-medium text-sm text-[#6e6a6a] mb-3 uppercase tracking-wider">Feriados em {selectedMonth}</h5>
            
            {holidays.isLoading ? (
              <div className="py-8 text-center text-sm text-[#6e6a6a]">Carregando...</div>
            ) : currentMonthHolidays.length === 0 ? (
              <div className="py-8 text-center text-sm text-[#6e6a6a] border border-dashed border-[#ece8e8] rounded-xl">
                Nenhum feriado ou dispensa global cadastrada neste mês.
              </div>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                {currentMonthHolidays.map((holiday) => (
                  <div key={holiday.id} className="flex items-center justify-between p-3 rounded-lg border border-[#f0dede] bg-[#fbf1f1]">
                    <div>
                      <div className="font-semibold text-[#b43737] text-sm">{holiday.name}</div>
                      <div className="text-xs text-[#b43737]/80 mt-0.5">
                        {new Date(`${holiday.holiday_date}T12:00:00`).toLocaleDateString('pt-BR')} • {holiday.is_paid ? 'Remunerado' : 'Não remunerado'}
                      </div>
                    </div>
                    <button onClick={() => deleteHoliday.mutate(holiday.id)} disabled={auth.user?.role !== 'admin' || deleteHoliday.isPending} className="p-2 hover:bg-[#f0dede] rounded-md transition-colors text-[#b43737]" title="Remover">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
