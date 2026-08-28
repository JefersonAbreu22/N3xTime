import { ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import Logo from './Logo';

export default function AuthRecoveryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell flex min-h-screen items-center justify-center px-5 py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border border-[#d9d7d7] bg-[#fcfbfb] shadow-[0_24px_90px_rgba(25,23,23,0.12)] lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="relative hidden overflow-hidden bg-[#191717] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(2,102,102,0.5),transparent_42%)]" />
          <div className="relative z-10"><Logo dark className="text-3xl" /></div>
          <div className="relative z-10 py-14">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5"><KeyRound className="h-7 w-7 text-[#7fdddd]" /></span>
            <h1 className="mt-6 text-4xl font-semibold tracking-[-0.05em]">Recupere seu acesso com segurança.</h1>
            <p className="mt-4 text-sm leading-7 text-white/68">O link é temporário, pessoal e deixa de funcionar imediatamente após a alteração da senha.</p>
          </div>
          <div className="relative z-10 flex items-center gap-2 text-xs text-white/55"><ShieldCheck className="h-4 w-4 text-[#7fdddd]" /> Proteção para todos os perfis de acesso</div>
        </aside>
        <main className="flex min-h-[620px] items-center justify-center p-6 sm:p-10 lg:p-12">
          <div className="w-full max-w-md">
            <Link to="/login" className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-[#6e6a6a] hover:text-[#026666]"><ArrowLeft className="h-4 w-4" /> Voltar ao login</Link>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
