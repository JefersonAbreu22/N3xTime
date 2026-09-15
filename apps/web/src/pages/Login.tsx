import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  Lock,
  Mail,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { authApi, type AccountCompany } from '../services/authApi';
import { useAuthStore } from '../stores/authStore';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [companySelection, setCompanySelection] = useState<{
    token: string;
    companies: AccountCompany[];
  } | null>(null);

  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);

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
        setCompanySelection({
          token: response.data.selection_token,
          companies: response.data.companies,
        });

        return;
      }

      setSession(response.data.token, response.data.user);

      toast.success('Login efetuado com sucesso!');

      navigate(
        response.data.user.must_change_password
          ? '/change-password'
          : response.data.user.is_platform_admin
            ? '/dashboard/platform/companies'
            : '/dashboard',
      );
    } catch (error: unknown) {
      const responseData = (
        error as {
          response?: {
            data?: unknown;
          };
        }
      ).response?.data;

      if (
        typeof responseData === 'string' &&
        responseData.toLowerCase().includes('<!doctype html')
      ) {
        toast.error(
          'A API de autenticação não respondeu. Verifique a configuração do servidor.',
        );
        return;
      }

      const apiError =
        typeof responseData === 'object' &&
        responseData !== null &&
        'error' in responseData
          ? String(
              (responseData as { error?: unknown }).error || '',
            )
          : '';

      toast.error(apiError || 'Credenciais inválidas.');
    } finally {
      setIsLoading(false);
    }
  };

  const selectCompany = async (company: AccountCompany) => {
    if (!companySelection) return;

    try {
      setIsLoading(true);

      const response = await authApi.selectCompany(
        companySelection.token,
        company.companyId,
      );

      if ('requires_company_selection' in response.data) {
        return;
      }

      setSession(response.data.token, response.data.user);

      toast.success(`Acessando ${company.name}.`);

      navigate(
        response.data.user.must_change_password
          ? '/change-password'
          : '/dashboard',
      );
    } catch {
      toast.error('Não foi possível acessar esta empresa.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#080a0b] px-4 py-8 sm:px-6">
      {/* Vídeo de fundo */}
      <video
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
      >
        <source src="/login-background.mp4" type="video/mp4" />
      </video>

      {/* Escurecimento do vídeo */}
      <div className="absolute inset-0 bg-black/65" />

      {/* Vinheta */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_15%,rgba(0,0,0,0.58)_100%)]" />

      {/* Card */}
      <section className="relative z-10 grid w-full max-w-[1100px] overflow-hidden rounded-[24px] border border-white/[0.10] bg-[#111415]/95 shadow-[0_35px_100px_rgba(0,0,0,0.55)] backdrop-blur-xl lg:min-h-[570px] lg:grid-cols-[1.08fr_0.92fr]">
        {/* LADO ESQUERDO */}
        <div className="relative hidden overflow-hidden border-r border-white/[0.06] bg-[#041516] lg:flex lg:flex-col lg:items-center lg:justify-center lg:px-14">
          {/* Efeito sutil */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(38,255,151,0.10),transparent_35%)]" />

          <div className="relative z-10 flex w-full max-w-[470px] flex-col items-center text-center">
            <img
              src="/n3xtime.png"
              alt="N3xTime"
              className="mb-12 max-h-[105px] w-auto max-w-[340px] object-contain"
            />

            <h1 className="max-w-[420px] text-[27px] font-bold leading-[1.18] tracking-[-0.035em] text-white">
              Gestão inteligente do tempo para uma operação mais eficiente
            </h1>

            <p className="mt-5 max-w-[440px] text-[15px] leading-7 text-white/60">
              Mais controle, agilidade e visão estratégica para transformar
              registros de ponto em uma gestão simples, segura e eficiente.
            </p>
          </div>

          {/* brilho inferior */}
          <div className="absolute -bottom-36 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-[#40f487]/10 blur-[100px]" />
        </div>

        {/* LADO DIREITO */}
        <div className="flex items-center justify-center bg-[linear-gradient(145deg,#191c1d_0%,#101213_100%)] px-6 py-10 sm:px-10 lg:px-12">
          <div className="w-full max-w-[410px]">
            {/* Logo mobile */}
            <div className="mb-8 flex justify-center lg:hidden">
              <img
                src="/n3xtime.png"
                alt="N3xTime"
                className="max-h-[70px] max-w-[230px] object-contain"
              />
            </div>

            {!companySelection ? (
              <>
                <div className="mb-8">
                  <h2 className="text-[32px] font-bold tracking-[-0.045em] text-white sm:text-[36px]">
                    Acesse sua conta
                  </h2>

                  <p className="mt-2 text-[15px] text-white/45">
                    Bem-vindo de volta!
                  </p>
                </div>

                <form
                  className="space-y-5"
                  onSubmit={handleLogin}
                >
                  {/* EMAIL */}
                  <div>
                    <label
                      htmlFor="email"
                      className="mb-2 block text-[13px] font-semibold text-white/75"
                    >
                      Usuário ou e-mail
                    </label>

                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-4 top-1/2 h-[19px] w-[19px] -translate-y-1/2 text-white/35" />

                      <input
                        id="email"
                        type="email"
                        autoComplete="username"
                        placeholder="Digite seu usuário ou e-mail"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-[50px] w-full rounded-[7px] border border-white/[0.14] bg-[#111415] pl-12 pr-4 text-[14px] text-white outline-none transition placeholder:text-white/30 hover:border-white/20 focus:border-[#5bf28a]/65 focus:ring-2 focus:ring-[#5bf28a]/10"
                      />
                    </div>
                  </div>

                  {/* SENHA */}
                  <div>
                    <label
                      htmlFor="password"
                      className="mb-2 block text-[13px] font-semibold text-white/75"
                    >
                      Senha
                    </label>

                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-4 top-1/2 h-[19px] w-[19px] -translate-y-1/2 text-white/35" />

                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="Digite sua senha"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-[50px] w-full rounded-[7px] border border-white/[0.14] bg-[#111415] pl-12 pr-12 text-[14px] text-white outline-none transition placeholder:text-white/30 hover:border-white/20 focus:border-[#5bf28a]/65 focus:ring-2 focus:ring-[#5bf28a]/10"
                      />

                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center justify-center text-white/40 transition hover:text-white/70"
                        aria-label={
                          showPassword
                            ? 'Ocultar senha'
                            : 'Mostrar senha'
                        }
                      >
                        {showPassword ? (
                          <EyeOff className="h-[19px] w-[19px]" />
                        ) : (
                          <Eye className="h-[19px] w-[19px]" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Lembrar / Esqueci senha */}
                  <div className="flex items-center justify-between gap-4">
                    <label className="flex cursor-pointer items-center gap-2 text-[12px] text-white/50">
                      <input
                        id="remember-me"
                        name="remember-me"
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer rounded border-white/20 bg-[#111415] accent-[#5bf28a]"
                      />

                      <span>Lembrar usuário</span>
                    </label>

                    <Link
                      to="/forgot-password"
                      className="text-[12px] font-semibold text-[#5bf28a] transition hover:text-[#7cff9f]"
                    >
                      Esqueceu a sua senha?
                    </Link>
                  </div>

                  {/* BOTÃO */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex h-[50px] w-full items-center justify-center gap-2 rounded-[7px] bg-[#5bf28a] px-5 text-[14px] font-bold text-[#07110a] transition hover:bg-[#75f89a] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isLoading ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#07110a]/30 border-t-[#07110a]" />
                        Validando acesso...
                      </>
                    ) : (
                      <>
                        Entrar
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="mb-7">
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-[#5bf28a]/10 text-[#5bf28a]">
                    <Building2 className="h-5 w-5" />
                  </div>

                  <h2 className="text-[30px] font-bold tracking-[-0.04em] text-white">
                    Selecione a empresa
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-white/45">
                    Sua conta possui acesso a mais de uma empresa.
                    Escolha o ambiente que deseja acessar.
                  </p>
                </div>

                <div className="space-y-3">
                  {companySelection.companies.map((company) => (
                    <button
                      key={company.membershipId}
                      type="button"
                      disabled={isLoading}
                      onClick={() => void selectCompany(company)}
                      className="group flex w-full items-center justify-between rounded-lg border border-white/[0.10] bg-white/[0.035] px-4 py-4 text-left transition hover:border-[#5bf28a]/40 hover:bg-[#5bf28a]/5 disabled:opacity-50"
                    >
                      <div>
                        <div className="font-semibold text-white">
                          {company.name}
                        </div>

                        <div className="mt-1 text-xs text-white/35">
                          Clique para acessar
                        </div>
                      </div>

                      <span className="rounded-md bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/45 transition group-hover:bg-[#5bf28a]/10 group-hover:text-[#5bf28a]">
                        {company.role}
                      </span>
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => setCompanySelection(null)}
                    disabled={isLoading}
                    className="mt-3 w-full py-3 text-sm font-medium text-white/45 transition hover:text-white"
                  >
                    Voltar
                  </button>
                </div>
              </>
            )}

            {/* NÍVEL 3 */}
            <div className="mt-9 flex justify-center border-t border-white/[0.06] pt-7">
              <a
                href="https://www.nivel3ti.com.br"
                target="_blank"
                rel="noopener noreferrer"
                title="Nível 3 Tecnologia"
                className="block opacity-80 transition hover:scale-[1.04] hover:opacity-100"
              >
                <img
                  src="/nivel3-logo.png"
                  alt="Nível 3 Tecnologia"
                  className="h-[33px] w-auto object-contain"
                />
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}