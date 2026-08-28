import { useQuery } from '@tanstack/react-query';
import { Fingerprint, MonitorSmartphone, ShieldAlert, ShieldCheck } from 'lucide-react';
import { authApi } from '../../../services/authApi';

export default function BiometricsTab() {
  const summaryQuery = useQuery({
    queryKey: ['biometrics', 'summary'],
    queryFn: async () => {
      const res = await authApi.getBiometricSummary();
      return res.data;
    },
  });

  const historyQuery = useQuery({
    queryKey: ['biometrics', 'history'],
    queryFn: async () => {
      const res = await authApi.getBiometricHistory();
      return res.data;
    },
  });

  const summary = summaryQuery.data || { totalUsers: 0, usersWithBiometrics: 0, usersWithoutBiometrics: 0 };
  const history = Array.isArray(historyQuery.data) ? historyQuery.data : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#191717]">Biometria Facial</h2>
          <p className="mt-2 text-sm text-[#6e6a6a]">Acompanhe os cadastros e eventos de reconhecimento facial no totem.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface-panel p-6">
          <div className="flex items-center gap-3 text-[#6e6a6a]">
            <UsersIcon className="h-5 w-5" />
            <span className="text-sm font-medium uppercase tracking-wider">Base Ativa</span>
          </div>
          <div className="mt-4 text-3xl font-semibold text-[#191717]">{summary.totalUsers}</div>
        </div>
        <div className="surface-panel p-6">
          <div className="flex items-center gap-3 text-[#026666]">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-sm font-medium uppercase tracking-wider">Com Biometria</span>
          </div>
          <div className="mt-4 text-3xl font-semibold text-[#191717]">{summary.usersWithBiometrics}</div>
          <div className="mt-1 text-sm text-[#6e6a6a]">
            {summary.totalUsers > 0 ? Math.round((summary.usersWithBiometrics / summary.totalUsers) * 100) : 0}% da base
          </div>
        </div>
        <div className="surface-panel p-6">
          <div className="flex items-center gap-3 text-amber-600">
            <ShieldAlert className="h-5 w-5" />
            <span className="text-sm font-medium uppercase tracking-wider">Sem Biometria</span>
          </div>
          <div className="mt-4 text-3xl font-semibold text-[#191717]">{summary.usersWithoutBiometrics}</div>
          <div className="mt-1 text-sm text-[#6e6a6a]">
            Apenas PIN disponível
          </div>
        </div>
      </div>

      <div className="surface-panel overflow-hidden">
        <div className="border-b border-[#ece8e8] px-6 py-5">
          <h3 className="text-lg font-semibold tracking-tight text-[#191717]">Últimos Eventos Biométricos</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#f8f6f6] text-xs uppercase tracking-wider text-[#6e6a6a]">
              <tr>
                <th className="px-6 py-4 font-medium">Data/Hora</th>
                <th className="px-6 py-4 font-medium">Colaborador</th>
                <th className="px-6 py-4 font-medium">Evento</th>
                <th className="px-6 py-4 font-medium">Método</th>
                <th className="px-6 py-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ece8e8] bg-white">
              {historyQuery.isLoading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[#6e6a6a]">Carregando histórico...</td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[#6e6a6a]">Nenhum evento registrado.</td>
                </tr>
              ) : (
                history.slice(0, 50).map((event: import('../../../services/authApi').BiometricHistoryEvent) => (
                  <tr key={event.id} className="transition-colors hover:bg-[#fcfbfb]">
                    <td className="px-6 py-4 text-[#6e6a6a]">
                      {new Date(event.created_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-6 py-4 font-medium text-[#191717]">
                      {event.User?.name || 'Desconhecido'}
                    </td>
                    <td className="px-6 py-4 text-[#6e6a6a]">
                      {event.event_type === 'verification_success' ? 'Verificação' :
                       event.event_type === 'verification_failure' ? 'Falha no Reconhecimento' :
                       event.event_type === 'pin_fallback' ? 'Uso de PIN' : event.event_type}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {event.method === 'facial' ? (
                          <Fingerprint className="h-4 w-4 text-[#026666]" />
                        ) : (
                          <MonitorSmartphone className="h-4 w-4 text-[#6e6a6a]" />
                        )}
                        <span className="text-[#6e6a6a] capitalize">{event.method}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {event.success ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                          Sucesso
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500"></span>
                          Falha
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function UsersIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
