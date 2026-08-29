import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Fingerprint, Lock, Mail, ShieldCheck, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Logo from '../components/Logo';
import { authApi, type AccountCompany } from '../services/authApi';
import { useAuthStore } from '../stores/authStore';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [companySelection, setCompanySelection] = useState<{ token: string; companies: AccountCompany[] } | null>(null);
  const navigate = useNavigate();
  const setSession = useAuthStore(s => s.setSession);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Preencha todos os campos.');
      return;
    }

    try {
      setIsLoading(true);
      const response = await authApi.login(email, password);
      if ('requires_company_selection' in response.data) {
        setCompanySelection({ token: response.data.selection_token, companies: response.data.companies });
        return;
      }
      setSession(response.data.token, response.data.user);
      toast.success('Login efetuado com sucesso!');
      navigate(response.data.user.must_change_password
        ? '/change-password'
        : response.data.user.is_platform_admin
          ? '/dashboard/platform/companies'
          : '/dashboard');
    } catch (error: unknown) {
      const responseData = (error as { response?: { data?: unknown } }).response?.data;
      if (typeof responseData === 'string' && responseData.toLowerCase().includes('<!doctype html')) {
        toast.error('A API de autenticação não respondeu. Verifique a configuração do servidor.');
        return;
      }
      toast.error('Credenciais inválidas.');
    } finally {
      setIsLoading(false);
    }
  };

  const selectCompany = async (company: AccountCompany) => {
    if (!companySelection) return;
    try {
      setIsLoading(true);
      const response = await authApi.selectCompany(companySelection.token, company.companyId);
      if ('requires_company_selection' in response.data) return;
      setSession(response.data.token, response.data.user);
      toast.success(`Acessando ${company.name}.`);
      navigate(response.data.user.must_change_password ? '/change-password' : '/dashboard');
    } catch {
      toast.error('Não foi possível acessar esta empresa.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-shell flex min-h-screen items-center justify-center px-6 py-10">
      <div className="grid w-full max-w-6xl overflow-hidden border border-[#d9d7d7] bg-[#fcfbfb] shadow-[0_24px_90px_rgba(25,23,23,0.12)] lg:grid-cols-[1.12fr_0.88fr]">
        <section className="relative hidden overflow-hidden bg-[#191717] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(2,102,102,0.45),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(239,238,238,0.08),transparent_22%)]" />
          <div className="relative z-10">
            <div className="inline-flex items-center border border-white/10 bg-white/5 px-4 py-2">
              <Logo dark className="text-2xl" />
            </div>
            <div className="mt-12 max-w-xl">
              <h1 className="text-5xl font-semibold leading-[1.05] tracking-[-0.05em]">
                Controle de ponto com visual corporativo e operação contínua.
              </h1>
              <p className="mt-6 max-w-lg text-sm leading-7 text-white/72">
                Plataforma preparada para RH, gestores e operação em totem com biometria facial,
                histórico auditável e gestão de equipes por setor.
              </p>
            </div>
          </div>

          <div className="relative z-10 grid gap-4 xl:grid-cols-3">
            <div className="border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <ShieldCheck className="mb-5 h-6 w-6 text-[#5fd1d1]" />
              <div className="text-lg font-semibold">Segurança operacional</div>
              <p className="mt-2 text-sm text-white/70">Acesso por perfil e rastreabilidade em cada fluxo.</p>
            </div>
            <div className="border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <Building2 className="mb-5 h-6 w-6 text-[#5fd1d1]" />
              <div className="text-lg font-semibold">Gestao por setores</div>
              <p className="mt-2 text-sm text-white/70">Estrutura organizacional clara para lideres e equipes.</p>
            </div>
            <div className="border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <Fingerprint className="mb-5 h-6 w-6 text-[#5fd1d1]" />
              <div className="text-lg font-semibold">Biometria integrada</div>
              <p className="mt-2 text-sm text-white/70">Cadastro facial e operação assistida no totem.</p>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center bg-[#fcfbfb] px-6 py-10 sm:px-10 lg:px-12">
          <div className="w-full max-w-md">
            <div className="mb-10">
              <div className="inline-flex items-center gap-3 border border-[#d9d7d7] bg-[#f8f6f6] px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#026666]">
                <Fingerprint className="h-5 w-5" />
                Ambiente Corporativo
              </div>
              <h2 className="mt-6 text-4xl font-semibold tracking-[-0.05em] text-[#191717]">
                Acesse o sistema
              </h2>
              <p className="mt-3 text-sm leading-7 text-[#6e6a6a]">
                Entre com seu e-mail corporativo para continuar no painel operacional.
              </p>
            </div>

            {companySelection ? (
              <div className="space-y-3">
                <p className="text-sm text-[#6e6a6a]">Sua conta possui acesso a mais de uma empresa. Escolha o ambiente:</p>
                {companySelection.companies.map((company) => (
                  <button key={company.membershipId} type="button" className="btn-secondary w-full justify-between" onClick={() => void selectCompany(company)} disabled={isLoading}>
                    <span>{company.name}</span><span className="text-xs uppercase">{company.role}</span>
                  </button>
                ))}
                <button type="button" className="btn-ghost w-full" onClick={() => setCompanySelection(null)}>Voltar</button>
              </div>
            ) : <form className="space-y-5" onSubmit={handleLogin}>
              <div>
                <label className="field-label">Email Corporativo</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6e6a6a]" />
                  <input
                    type="email"
                    className="field-input pl-12"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="field-label">Senha</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6e6a6a]" />
                  <input
                    type="password"
                    className="field-input pl-12"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 border border-[#ebe8e8] bg-[#f8f6f6] px-4 py-3 text-sm text-[#6e6a6a]">
                <label className="flex items-center gap-2 font-medium text-[#393636]">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    className="h-4 w-4 rounded border-[#c7c4c4] text-[#026666] focus:ring-[#026666]"
                  />
                  Manter sessao ativa
                </label>
                <Link to="/forgot-password" className="font-semibold text-[#026666] transition-colors hover:text-[#014f4f]">
                  Esqueci minha senha
                </Link>
              </div>

              <button type="submit" disabled={isLoading} className="btn-primary w-full">
                {isLoading ? 'Validando acesso...' : 'Entrar no Painel'}
                {!isLoading && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>}

            <div className="mt-8 border-t border-[#e7e4e4] pt-5 text-xs uppercase tracking-[0.18em] text-[#8b8686]">
              Portal de RH, lideranca e colaboradores
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
