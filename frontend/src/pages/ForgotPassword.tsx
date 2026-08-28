import { useState, type FormEvent } from 'react';
import { CheckCircle2, Mail, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import AuthRecoveryLayout from '../components/AuthRecoveryLayout';
import { authApi } from '../services/authApi';

const getErrorMessage = (error: unknown) => (error as { response?: { data?: { error?: string } } }).response?.data?.error;

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return toast.error('Informe seu e-mail corporativo.');
    try {
      setIsLoading(true);
      await authApi.requestPasswordReset(email.trim());
      setSent(true);
    } catch (error) {
      toast.error(getErrorMessage(error) || 'Não foi possível solicitar a redefinição agora.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthRecoveryLayout>
      {sent ? (
        <div>
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e7f5f3] text-[#026666]"><CheckCircle2 className="h-7 w-7" /></span>
          <h2 className="mt-6 text-3xl font-semibold tracking-[-0.045em] text-[#191717]">Confira seu e-mail</h2>
          <p className="mt-3 text-sm leading-6 text-[#6e6a6a]">Se <strong className="text-[#393636]">{email}</strong> estiver cadastrado e ativo, você receberá um link válido por 30 minutos.</p>
          <div className="mt-6 rounded-xl border border-[#dceaea] bg-[#f4f9f9] p-4 text-sm leading-6 text-[#4f6666]">Não encontrou? Confira a caixa de spam e aguarde alguns minutos antes de solicitar novamente.</div>
          <button type="button" className="btn-secondary mt-6 w-full" onClick={() => setSent(false)}>Enviar para outro e-mail</button>
        </div>
      ) : (
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#026666]">Recuperação de acesso</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em] text-[#191717]">Esqueceu sua senha?</h2>
          <p className="mt-3 text-sm leading-6 text-[#6e6a6a]">Informe o e-mail usado no sistema. Enviaremos as instruções para criar uma nova senha.</p>
          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block"><span className="field-label">E-mail corporativo</span><span className="relative block"><Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6e6a6a]" /><input type="email" autoComplete="email" autoFocus className="field-input pl-12" placeholder="seu@email.com" value={email} onChange={(event) => setEmail(event.target.value)} /></span></label>
            <button type="submit" className="btn-primary w-full" disabled={isLoading}>{isLoading ? 'Enviando instruções...' : 'Enviar link de redefinição'}{!isLoading && <Send className="h-4 w-4" />}</button>
          </form>
        </div>
      )}
    </AuthRecoveryLayout>
  );
}
