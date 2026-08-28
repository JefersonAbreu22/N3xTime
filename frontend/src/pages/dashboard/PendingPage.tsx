import { AlertTriangle, ClipboardList, MapPinned, ShieldAlert } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
import { reportsApi } from '../../services/reportsApi';
import { requestsApi } from '../../services/requestsApi';
import { monthStartKey, todayKey } from '../../components/dashboard/dashboardUtils';
import ReviewQueue from '../../components/dashboard/ReviewQueue';
import RecordExceptionQueue from '../../components/dashboard/RecordExceptionQueue';

export default function PendingPage() {
  const auth = useAuthStore();
  const isManagement = auth.user?.role === 'manager' || auth.user?.role === 'admin';

  const hrSummary = useQuery({
    queryKey: ['pending', 'hr-summary', todayKey()],
    queryFn: async () => reportsApi.hrSummary({ startDate: monthStartKey(), endDate: todayKey() }),
    enabled: !!auth.token && isManagement,
  });

  const reviewQueue = useQuery({
    queryKey: ['pending', 'requests', 'review'],
    queryFn: async () => {
      const res = await requestsApi.reviewQueue({ status: 'pending' });
      return res.data;
    },
    enabled: !!auth.token && isManagement,
  });

  if (!isManagement) {
    return (
      <div className="surface-panel py-16 text-center text-[#6e6a6a]">
        Esta área está disponível apenas para liderança e RH.
      </div>
    );
  }

  const summary = hrSummary.data?.data;
  const pendingItems = [
    {
      title: 'Ajustes e solicitações',
      count: reviewQueue.data?.length ?? summary?.metrics.pendingApprovals ?? 0,
      note: 'Pedidos aguardando decisão.',
      icon: ClipboardList,
    },
    {
      title: 'Marcações fora da área',
      count: summary?.exceptionQueue.length ?? 0,
      note: 'Registros com necessidade de conferência.',
      icon: MapPinned,
    },
    {
      title: 'Pessoas atrasadas',
      count: summary?.metrics.lateToday ?? 0,
      note: 'Entradas além da tolerância.',
      icon: AlertTriangle,
    },
    {
      title: 'Risco operacional',
      count: (summary?.metrics.pinFallbacks ?? 0) + (summary?.metrics.biometricFailures ?? 0),
      note: 'Falhas biométricas e contingência por PIN.',
      icon: ShieldAlert,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="border-b border-[#e7e4e4] p-5 md:p-6 xl:border-b-0 xl:border-r">
            <div className="page-eyebrow">Pendências</div>
            <h2 className="page-title">Fila operacional do dia</h2>
            <p className="page-description">
              Gestores e RH passam a ter um ponto único para aprovações, exceções e sinais de risco da operação.
            </p>
          </div>
          <div className="p-5 md:p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6e6a6a]">Resumo rápido</div>
            <div className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#191717]">
              {(reviewQueue.data?.length ?? 0) + (summary?.exceptionQueue.length ?? 0)} itens em atenção
            </div>
            <div className="mt-2 text-sm leading-6 text-[#6e6a6a]">
              Priorize aprovações pendentes, exceções de geolocalização e registros com indícios de contingência.
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {pendingItems.map((item) => {
          const Icon = item.icon;

          return (
            <div key={item.title} className="metric-card">
              <div className="flex items-center justify-between">
                <div className="metric-label">{item.title}</div>
                <Icon className="h-5 w-5 text-[#026666]" />
              </div>
              <div className="metric-value">{item.count}</div>
              <div className="mt-2 text-sm text-[#6e6a6a]">{item.note}</div>
            </div>
          );
        })}
      </section>

      <ReviewQueue />
      <RecordExceptionQueue />
    </div>
  );
}
