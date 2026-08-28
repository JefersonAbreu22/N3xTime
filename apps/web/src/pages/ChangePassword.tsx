import { useState, type FormEvent } from 'react';
import { KeyRound, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AuthRecoveryLayout from '../components/AuthRecoveryLayout';
import { authApi } from '../services/authApi';
import { useAuthStore } from '../stores/authStore';

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const markPasswordChanged = useAuthStore((state) => state.markPasswordChanged);
  const navigate = useNavigate();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmation) return toast.error('A confirmação não corresponde à nova senha.');
    try {
      setLoading(true);
      const response = await authApi.changePassword(currentPassword, newPassword);
      markPasswordChanged();
      toast.success(response.message);
      navigate('/dashboard');
    } catch (error: unknown) {
      toast.error((error as { response?: { data?: { error?: string } } }).response?.data?.error || 'Não foi possível alterar a senha.');
    } finally {
      setLoading(false);
    }
  };

  return <AuthRecoveryLayout><div><KeyRound className="h-10 w-10 text-[#026666]" /><div className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-[#026666]">Primeiro acesso</div><h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em]">Crie sua senha definitiva</h2><p className="mt-3 text-sm leading-6 text-[#6e6a6a]">Por segurança, substitua a senha temporária antes de acessar o painel da empresa.</p><form className="mt-7 space-y-4" onSubmit={submit}>
    <PasswordField label="Senha temporária" value={currentPassword} onChange={setCurrentPassword} />
    <PasswordField label="Nova senha" value={newPassword} onChange={setNewPassword} />
    <PasswordField label="Confirmar nova senha" value={confirmation} onChange={setConfirmation} />
    <p className="text-xs leading-5 text-[#6e6a6a]">Use pelo menos 8 caracteres, incluindo maiúscula, minúscula, número e símbolo.</p>
    <button className="btn-primary w-full" disabled={loading}>{loading ? 'Alterando...' : 'Salvar nova senha'}</button>
  </form></div></AuthRecoveryLayout>;
}

function PasswordField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="field-label">{label}</span><span className="relative block"><Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6e6a6a]" /><input className="field-input pl-11" type="password" value={value} onChange={(event) => onChange(event.target.value)} required /></span></label>;
}
