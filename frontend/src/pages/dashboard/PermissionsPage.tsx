import { ArrowRight, Building2, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

export default function PermissionsPage() {
  const auth = useAuthStore();

  return (
    <div className="space-y-5">
      <div className="surface-panel p-6">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#026666]">Políticas</div>
        <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#191717]">Funções e permissões</h3>
        {auth.user?.role !== 'admin' ? (
          <div className="mt-4 text-sm text-[#6e6a6a]">Acesso restrito ao RH/Administrador.</div>
        ) : (
          <div className="mt-4 text-sm leading-7 text-[#6e6a6a]">
            Nenhuma regra personalizada cadastrada. As permissões atuais seguem os perfis fixos: admin, manager e employee.
          </div>
        )}
      </div>

      {auth.user?.is_platform_admin && (
        <div className="surface-panel overflow-hidden border-[#b9dede]">
          <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#e4f4f4] text-[#026666]">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#026666]">
                  <ShieldCheck className="h-4 w-4" /> Acesso global
                </div>
                <h3 className="mt-2 text-xl font-semibold text-[#191717]">Administração da plataforma</h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6e6a6a]">
                  Gerencie empresas, provisionamento, bloqueios e auditoria. Esta área é exclusiva para Super Administradores.
                </p>
              </div>
            </div>
            <Link className="btn-primary shrink-0" to="/dashboard/platform/companies">
              Abrir painel global
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
