import { useMemo, useState, type FormEvent } from 'react';
import { Check, CheckCircle2, Eye, EyeOff, KeyRound } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AuthRecoveryLayout from '../components/AuthRecoveryLayout';
import { authApi } from '../services/authApi';

const getErrorMessage = (error: unknown) => (error as { response?: { data?: { error?: string } } }).response?.data?.error;

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const requirements = useMemo(() => [
    { label: '8 caracteres ou mais', valid: password.length >= 8 && password.length <= 72 },
    { label: 'Uma letra maiúscula', valid: /[A-Z]/.test(password) },
    { label: 'Uma letra minúscula', valid: /[a-z]/.test(password) },
    { label: 'Um número', valid: /[0-9]/.test(password) },
  ], [password]);
  const validPassword = requirements.every((requirement) => requirement.valid);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return toast.error('O link de redefinição está incompleto.');
    if (!validPassword) return toast.error('A nova senha ainda não atende aos requisitos.');
    if (password !== confirmation) return toast.error('As senhas informadas não são iguais.');
    try {
      setIsLoading(true);
      await authApi.resetPassword(token, password);
      setCompleted(true);
    } catch (error) {
      toast.error(getErrorMessage(error) || 'Não foi possível redefinir a senha.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthRecoveryLayout>
      {completed ? (
        <div><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e7f5f3] text-[#026666]"><CheckCircle2 className="h-7 w-7" /></span><h2 className="mt-6 text-3xl font-semibold tracking-[-0.045em] text-[#191717]">Senha redefinida</h2><p className="mt-3 text-sm leading-6 text-[#6e6a6a]">Sua nova senha já está ativa. O link utilizado não poderá ser usado novamente.</p><Link to="/login" className="btn-primary mt-7 w-full">Entrar no sistema</Link></div>
      ) : !token ? (
        <div><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fbebeb] text-[#b43737]"><KeyRound className="h-7 w-7" /></span><h2 className="mt-6 text-3xl font-semibold tracking-[-0.045em] text-[#191717]">Link incompleto</h2><p className="mt-3 text-sm leading-6 text-[#6e6a6a]">Solicite um novo e-mail de redefinição para continuar.</p><Link to="/forgot-password" className="btn-primary mt-7 w-full">Solicitar novo link</Link></div>
      ) : (
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#026666]">Nova credencial</div><h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em] text-[#191717]">Crie uma nova senha</h2><p className="mt-3 text-sm leading-6 text-[#6e6a6a]">Escolha uma senha diferente da atual e que atenda aos requisitos de segurança.</p>
          <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
            <label className="block"><span className="field-label">Nova senha</span><span className="relative block"><KeyRound className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6e6a6a]" /><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" autoFocus className="field-input px-12" value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6e6a6a]" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></span></label>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-[#ebe8e8] bg-[#f8f6f6] p-3">{requirements.map((requirement) => <div key={requirement.label} className={`flex items-center gap-1.5 text-[11px] font-medium ${requirement.valid ? 'text-[#026666]' : 'text-[#8b8686]'}`}><Check className="h-3.5 w-3.5" />{requirement.label}</div>)}</div>
            <label className="block"><span className="field-label">Confirme a nova senha</span><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" className="field-input" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
            <button type="submit" className="btn-primary w-full" disabled={isLoading}>{isLoading ? 'Redefinindo senha...' : 'Salvar nova senha'}</button>
          </form>
        </div>
      )}
    </AuthRecoveryLayout>
  );
}
