import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
import { companyApi } from '../../services/companyApi';
import { authApi } from '../../services/authApi';
import CorporateCalendar from '../../components/dashboard/settings/CorporateCalendar';
import LocationSettings from '../../components/dashboard/settings/LocationSettings';

export default function SettingsPage() {
  const auth = useAuthStore();
  const queryClient = useQueryClient();
  const [kioskKeyForm, setKioskKeyForm] = useState({ currentPassword: '', newKey: '', confirmation: '' });
  const [companyForm, setCompanyForm] = useState({
    legal_name: '',
    trade_name: '',
    cnpj: '',
    email: '',
    phone: '',
    address_line: '',
    city: '',
    state: '',
    zip_code: '',
    night_shift_start: '22:00',
    night_shift_end: '05:00',
    late_tolerance_minutes: 5,
    lunch_tolerance_minutes: 10,
    latitude: '' as number | string,
    longitude: '' as number | string,
    allowed_radius: 200 as number | string,
    block_outside_area: false,
  });

  const company = useQuery({
    queryKey: ['company-profile'],
    queryFn: companyApi.get,
    enabled: auth.user?.role === 'admin' || auth.user?.role === 'manager',
  });

  useEffect(() => {
    if (!company.data?.data) return;
    setCompanyForm({
      legal_name: company.data.data.legal_name || '',
      trade_name: company.data.data.trade_name || '',
      cnpj: company.data.data.cnpj || '',
      email: company.data.data.email || '',
      phone: company.data.data.phone || '',
      address_line: company.data.data.address_line || '',
      city: company.data.data.city || '',
      state: company.data.data.state || '',
      zip_code: company.data.data.zip_code || '',
      night_shift_start: company.data.data.night_shift_start || '22:00',
      night_shift_end: company.data.data.night_shift_end || '05:00',
      late_tolerance_minutes: company.data.data.late_tolerance_minutes ?? 5,
      lunch_tolerance_minutes: company.data.data.lunch_tolerance_minutes ?? 10,
      latitude: company.data.data.latitude ?? '',
      longitude: company.data.data.longitude ?? '',
      allowed_radius: company.data.data.allowed_radius ?? 200,
      block_outside_area: company.data.data.block_outside_area ?? false,
    });
  }, [company.data]);

  const kioskStatus = useQuery({
    queryKey: ['kiosk-status'],
    queryFn: () => authApi.getKioskStatus(),
    enabled: auth.user?.role === 'admin',
  });

  const releaseKiosk = useMutation({
    mutationFn: authApi.releaseKioskSession,
    onSuccess: (response) => {
      toast.success(response.message || 'Terminal liberado.');
      queryClient.invalidateQueries({ queryKey: ['kiosk-status'] });
    },
    onError: () => {
      toast.error('Não foi possível liberar o terminal.');
    },
  });

  const revokeKiosk = useMutation({
    mutationFn: authApi.revokeKioskSession,
    onSuccess: (response) => {
      toast.success(response.message || 'Sessão do terminal encerrada.');
      queryClient.invalidateQueries({ queryKey: ['kiosk-status'] });
    },
    onError: () => {
      toast.error('Não foi possível encerrar a sessão do terminal.');
    },
  });

  const rotateKioskKey = useMutation({
    mutationFn: () => companyApi.rotateKioskKey(kioskKeyForm.currentPassword, kioskKeyForm.newKey),
    onSuccess: (response) => {
      toast.success(response.message);
      setKioskKeyForm({ currentPassword: '', newKey: '', confirmation: '' });
      queryClient.invalidateQueries({ queryKey: ['kiosk-status'] });
    },
    onError: (error: unknown) => {
      const message = (error as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(message || 'Não foi possível alterar a chave do quiosque.');
    },
  });

  const submitKioskKeyRotation = () => {
    if (kioskKeyForm.newKey.length < 12) return toast.error('A nova chave deve ter pelo menos 12 caracteres.');
    if (kioskKeyForm.newKey !== kioskKeyForm.confirmation) return toast.error('A confirmação da chave não corresponde.');
    rotateKioskKey.mutate();
  };

  const saveCompany = useMutation({
    mutationFn: async () => companyApi.update({
      ...companyForm,
      latitude: companyForm.latitude ? Number(companyForm.latitude) : null,
      longitude: companyForm.longitude ? Number(companyForm.longitude) : null,
      allowed_radius: companyForm.allowed_radius ? Number(companyForm.allowed_radius) : null,
    }),
    onSuccess: (response) => {
      toast.success(response.message || 'Dados da empresa atualizados.');
      queryClient.invalidateQueries({ queryKey: ['company-profile'] });
      queryClient.invalidateQueries({ queryKey: ['reports', 'summary'] });
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || 'Não foi possível atualizar os dados da empresa.');
    },
  });

  const geocodeAddress = async () => {
    let query = '';
    if (companyForm.address_line && companyForm.city && companyForm.state) {
      query = `${companyForm.address_line}, ${companyForm.city}, ${companyForm.state}`;
    } else if (companyForm.zip_code) {
      query = companyForm.zip_code;
    } else {
      toast.error('Preencha o endereço completo ou o CEP para buscar as coordenadas.');
      return;
    }

    try {
      const apiKey = '';
      
      if (!apiKey) {
        // Fallback para OpenStreetMap (Nominatim) se não houver chave do Google Maps
        toast.loading('Buscando coordenadas (OpenStreetMap)...', { id: 'geocode' });
        await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
        
        if (!res.ok) throw new Error('Erro na requisição');
        
        const data = await res.json();
        
        if (data && data.length > 0) {
          setCompanyForm((state) => ({
            ...state,
            latitude: data[0].lat,
            longitude: data[0].lon,
          }));
          toast.success('Coordenadas encontradas com sucesso!', { id: 'geocode' });
        } else {
          if (query.includes(',')) {
            const fallbackQuery = `${companyForm.city}, ${companyForm.state}`;
            const fallbackRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fallbackQuery)}&limit=1`);
            const fallbackData = await fallbackRes.json();
            
            if (fallbackData && fallbackData.length > 0) {
              setCompanyForm((state) => ({
                ...state,
                latitude: fallbackData[0].lat,
                longitude: fallbackData[0].lon,
              }));
              toast.success('Coordenadas aproximadas (cidade/estado) encontradas.', { id: 'geocode' });
            } else {
              toast.error('Endereço não encontrado. Preencha a latitude e longitude manualmente.', { id: 'geocode' });
            }
          } else {
            toast.error('Endereço não encontrado. Preencha a latitude e longitude manualmente.', { id: 'geocode' });
          }
        }
        return;
      }

      // Se houver chave, usa o Google Maps
      toast.loading('Buscando coordenadas no Google Maps...', { id: 'geocode' });
      const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`);
      
      if (!res.ok) throw new Error('Erro na requisição');
      
      const data = await res.json();
      
      if (data.status === 'OK' && data.results && data.results.length > 0) {
        const location = data.results[0].geometry.location;
        setCompanyForm((state) => ({
          ...state,
          latitude: location.lat,
          longitude: location.lng,
        }));
        toast.success('Coordenadas encontradas com sucesso!', { id: 'geocode' });
      } else {
        // Tentar uma busca menos restritiva se a primeira falhar e tiver endereço completo
        if (query.includes(',')) {
          const fallbackQuery = `${companyForm.city}, ${companyForm.state}`;
          const fallbackRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fallbackQuery)}&key=${apiKey}`);
          const fallbackData = await fallbackRes.json();
          
          if (fallbackData.status === 'OK' && fallbackData.results && fallbackData.results.length > 0) {
            const fallbackLocation = fallbackData.results[0].geometry.location;
            setCompanyForm((state) => ({
              ...state,
              latitude: fallbackLocation.lat,
              longitude: fallbackLocation.lng,
            }));
            toast.success('Coordenadas aproximadas (cidade/estado) encontradas.', { id: 'geocode' });
          } else {
            toast.error('Endereço não encontrado. Preencha a latitude e longitude manualmente.', { id: 'geocode' });
          }
        } else {
          toast.error('Endereço não encontrado. Preencha a latitude e longitude manualmente.', { id: 'geocode' });
        }
      }
    } catch (err) {
      console.error('Erro de geocodificação:', err);
      toast.error('Erro ao buscar coordenadas. Serviço temporariamente indisponível.', { id: 'geocode' });
    }
  };

  const fetchCNPJ = async () => {
    const cleanCNPJ = companyForm.cnpj.replace(/\D/g, '');
    if (cleanCNPJ.length !== 14) {
      toast.error('CNPJ inválido. Digite 14 números.');
      return;
    }

    try {
      toast.loading('Buscando CNPJ...', { id: 'cnpj-fetch' });
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCNPJ}`);
      if (!res.ok) {
        throw new Error('CNPJ não encontrado');
      }
      const data = await res.json();
      
      setCompanyForm((state) => ({
        ...state,
        legal_name: data.razao_social || state.legal_name,
        trade_name: data.nome_fantasia || state.trade_name,
        email: data.email || state.email,
        phone: data.ddd_telefone_1 || state.phone,
        zip_code: data.cep || state.zip_code,
        address_line: data.logradouro ? `${data.logradouro}${data.numero ? `, ${data.numero}` : ''}${data.complemento ? ` - ${data.complemento}` : ''}` : state.address_line,
        city: data.municipio || state.city,
        state: data.uf || state.state,
      }));
      toast.success('Dados do CNPJ importados com sucesso!', { id: 'cnpj-fetch' });
    } catch (_err) {
      toast.error('Erro ao buscar CNPJ. Verifique se o número está correto.', { id: 'cnpj-fetch' });
    }
  };

  const fetchCEP = async () => {
    const cleanCEP = companyForm.zip_code.replace(/\D/g, '');
    if (cleanCEP.length !== 8) {
      toast.error('CEP inválido. Digite 8 números.');
      return;
    }

    try {
      toast.loading('Buscando CEP...', { id: 'cep-fetch' });
      const res = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`);
      if (!res.ok) throw new Error('Erro na requisição');
      
      const data = await res.json();
      if (data.erro) throw new Error('CEP não encontrado');
      
      setCompanyForm((state) => ({
        ...state,
        address_line: data.logradouro || state.address_line,
        city: data.localidade || state.city,
        state: data.uf || state.state,
      }));
      toast.success('Endereço importado com sucesso!', { id: 'cep-fetch' });
    } catch (_err) {
      toast.error('Erro ao buscar CEP. Verifique se o número está correto.', { id: 'cep-fetch' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="surface-panel p-6">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#026666]">Governanca</div>
        <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#191717]">Configuracoes do sistema</h3>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[#6e6a6a]">
          Mantenha acessos, regras fixas e pontos de governanca centralizados em um unico ambiente.
        </p>
      </div>

      <div className="surface-panel grid gap-0 md:grid-cols-2">
        <div className="border-b border-[#ece8e8] p-6 md:border-b-0 md:border-r">
          <div className="metric-label">Permissoes</div>
          <div className="mt-4 text-xl font-semibold tracking-[-0.04em] text-[#191717]">Perfis do sistema</div>
          <div className="mt-2 text-sm text-[#6e6a6a]">Admin, lider e colaborador com regras por hierarquia.</div>
        </div>
        <div className="p-6">
          <div className="metric-label">Acesso atual</div>
          <div className="mt-4 text-xl font-semibold tracking-[-0.04em] text-[#191717]">
            {auth.user?.role === 'admin' ? 'Administrador' : 'Somente leitura'}
          </div>
          <div className="mt-2 text-sm text-[#6e6a6a]">
            Página: <Link className="font-semibold text-[#026666]" to="/dashboard/settings/permissions">/dashboard/settings/permissions</Link>
          </div>
        </div>
      </div>

      <div className="surface-panel p-6">
        <div className="mb-5 flex flex-col gap-3 border-b border-[#ece8e8] pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#026666]">Empresa</div>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#191717]">Cadastro institucional e parâmetros legais</h3>
          </div>
          <div className="text-sm text-[#6e6a6a]">Razão social, contato, tolerâncias e janela de adicional noturno.</div>
        </div>

        {company.isLoading ? (
          <div className="py-16 text-center text-[#6e6a6a]">Carregando dados da empresa...</div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <label className="field-label">Razão social</label>
                <input className="field-input" value={companyForm.legal_name} onChange={(e) => setCompanyForm((state) => ({ ...state, legal_name: e.target.value }))} />
              </div>
              <div>
                <label className="field-label">Nome fantasia</label>
                <input className="field-input" value={companyForm.trade_name} onChange={(e) => setCompanyForm((state) => ({ ...state, trade_name: e.target.value }))} />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="field-label mb-0">CNPJ</label>
                  <button type="button" onClick={fetchCNPJ} className="text-xs font-medium text-[#026666] hover:text-[#014444] transition-colors">
                    Buscar dados
                  </button>
                </div>
                <input className="field-input" value={companyForm.cnpj} onChange={(e) => setCompanyForm((state) => ({ ...state, cnpj: e.target.value }))} placeholder="00.000.000/0000-00" />
              </div>
              <div>
                <label className="field-label">E-mail</label>
                <input className="field-input" value={companyForm.email} onChange={(e) => setCompanyForm((state) => ({ ...state, email: e.target.value }))} />
              </div>
              <div>
                <label className="field-label">Telefone</label>
                <input className="field-input" value={companyForm.phone} onChange={(e) => setCompanyForm((state) => ({ ...state, phone: e.target.value }))} />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="field-label mb-0">CEP</label>
                  <button type="button" onClick={fetchCEP} className="text-xs font-medium text-[#026666] hover:text-[#014444] transition-colors">
                    Buscar endereço
                  </button>
                </div>
                <input className="field-input" value={companyForm.zip_code} onChange={(e) => setCompanyForm((state) => ({ ...state, zip_code: e.target.value }))} placeholder="00000-000" />
              </div>
              <div className="xl:col-span-2">
                <label className="field-label">Endereço</label>
                <input className="field-input" value={companyForm.address_line} onChange={(e) => setCompanyForm((state) => ({ ...state, address_line: e.target.value }))} />
              </div>
              <div>
                <label className="field-label">Cidade</label>
                <input className="field-input" value={companyForm.city} onChange={(e) => setCompanyForm((state) => ({ ...state, city: e.target.value }))} />
              </div>
              <div>
                <label className="field-label">Estado</label>
                <input className="field-input" value={companyForm.state} onChange={(e) => setCompanyForm((state) => ({ ...state, state: e.target.value }))} />
              </div>
              <div>
                <label className="field-label">Início noturno</label>
                <input type="time" className="field-input" value={companyForm.night_shift_start} onChange={(e) => setCompanyForm((state) => ({ ...state, night_shift_start: e.target.value }))} />
              </div>
              <div>
                <label className="field-label">Fim noturno</label>
                <input type="time" className="field-input" value={companyForm.night_shift_end} onChange={(e) => setCompanyForm((state) => ({ ...state, night_shift_end: e.target.value }))} />
              </div>
              <div>
                <label className="field-label">Tolerância de atraso (min)</label>
                <input type="number" min="0" max="180" className="field-input" value={companyForm.late_tolerance_minutes} onChange={(e) => setCompanyForm((state) => ({ ...state, late_tolerance_minutes: Number(e.target.value || 0) }))} />
              </div>
              <div>
                <label className="field-label">Tolerância de almoço (min)</label>
                <input type="number" min="0" max="180" className="field-input" value={companyForm.lunch_tolerance_minutes} onChange={(e) => setCompanyForm((state) => ({ ...state, lunch_tolerance_minutes: Number(e.target.value || 0) }))} />
              </div>
            </div>

            <LocationSettings 
              latitude={companyForm.latitude}
              longitude={companyForm.longitude}
              allowedRadius={companyForm.allowed_radius}
              blockOutsideArea={companyForm.block_outside_area}
              onChange={(updates) => setCompanyForm(state => ({ ...state, ...updates }))}
              onGeocodeRequest={geocodeAddress}
            />

            <div className="flex justify-end pt-4">
              <button onClick={() => saveCompany.mutate()} disabled={auth.user?.role !== 'admin' || saveCompany.isPending || companyForm.legal_name.trim().length < 2} className="btn-primary">
                {saveCompany.isPending ? 'Salvando empresa...' : 'Salvar dados da empresa'}
              </button>
            </div>
          </div>
        )}
      </div>

      <CorporateCalendar />

      <div className="surface-panel grid gap-0 md:grid-cols-[1.1fr_0.9fr]">
        <div className="border-b border-[#ece8e8] p-6 md:border-b-0 md:border-r">
          <div className="metric-label">Totem fixo</div>
          <div className="mt-4 text-xl font-semibold tracking-[-0.04em] text-[#191717]">Sessão do terminal</div>
          <div className="mt-2 text-sm leading-7 text-[#6e6a6a]">
            O quiosque é vinculado à empresa pela chave exclusiva e suas sessões são controladas pelo administrador.
          </div>
        </div>
        <div className="p-6">
          {auth.user?.role !== 'admin' ? (
            <div className="text-sm text-[#6e6a6a]">Somente administradores podem gerenciar a sessão do terminal.</div>
          ) : kioskStatus.isLoading ? (
            <div className="text-sm text-[#6e6a6a]">Carregando status do totem...</div>
          ) : (
            <div className="space-y-4">
              <div className="surface-muted p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6e6a6a]">Versão atual da sessão</div>
                <div className="mt-2 text-xl font-semibold text-[#191717]">
                  #{kioskStatus.data?.data.sessionVersion ?? '—'}
                </div>
                <div className="mt-3 text-sm text-[#6e6a6a]">
                  Status do terminal: {kioskStatus.data?.data.terminalEnabled ? 'Liberado para o totem' : 'Bloqueado aguardando liberação'}
                </div>
                <div className="mt-2 text-sm text-[#6e6a6a]">
                  Última liberação: {kioskStatus.data?.data.releasedAt ? new Date(kioskStatus.data.data.releasedAt).toLocaleString() : 'Nenhum registro'}
                </div>
                <div className="mt-2 text-sm text-[#6e6a6a]">
                  Último encerramento: {kioskStatus.data?.data.lastRevokedAt ? new Date(kioskStatus.data.data.lastRevokedAt).toLocaleString() : 'Nenhum registro'}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button onClick={() => releaseKiosk.mutate()} disabled={releaseKiosk.isPending || kioskStatus.data?.data.terminalEnabled} className="btn-secondary w-full">
                  {releaseKiosk.isPending ? 'Liberando terminal...' : 'Liberar terminal'}
                </button>
                <button onClick={() => revokeKiosk.mutate()} disabled={revokeKiosk.isPending || !kioskStatus.data?.data.terminalEnabled} className="btn-primary w-full">
                  {revokeKiosk.isPending ? 'Encerrando sessão...' : 'Encerrar sessão do terminal'}
                </button>
              </div>
              <div className="border-t border-[#e5e1e1] pt-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#191717]"><KeyRound className="h-4 w-4 text-[#026666]" />Alterar chave de acesso</div>
                <p className="mt-2 text-xs leading-5 text-[#6e6a6a]">A chave identifica automaticamente esta empresa. Ao alterá-la, todas as sessões existentes serão encerradas.</p>
                <div className="mt-4 space-y-3">
                  <input type="password" className="field-input" placeholder="Sua senha de administrador" value={kioskKeyForm.currentPassword} onChange={(event) => setKioskKeyForm((state) => ({ ...state, currentPassword: event.target.value }))} />
                  <input type="password" className="field-input" placeholder="Nova chave (mínimo 12 caracteres)" value={kioskKeyForm.newKey} onChange={(event) => setKioskKeyForm((state) => ({ ...state, newKey: event.target.value }))} />
                  <input type="password" className="field-input" placeholder="Confirmar nova chave" value={kioskKeyForm.confirmation} onChange={(event) => setKioskKeyForm((state) => ({ ...state, confirmation: event.target.value }))} />
                  <button onClick={submitKioskKeyRotation} disabled={rotateKioskKey.isPending || !kioskKeyForm.currentPassword || !kioskKeyForm.newKey || !kioskKeyForm.confirmation} className="btn-secondary w-full">
                    {rotateKioskKey.isPending ? 'Alterando chave...' : 'Alterar chave e revogar terminais'}
                  </button>
                </div>
              </div>
              <div className="text-xs leading-6 text-[#6e6a6a]">
                A liberação, o encerramento e a rotação da chave ficam restritos a esta área administrativa. Após a liberação, informe a chave no terminal.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
