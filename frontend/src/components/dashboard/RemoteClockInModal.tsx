import { useState, useRef, useCallback, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import { http } from '../../services/http';

type RemoteClockInModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function RemoteClockInModal({ isOpen, onClose }: RemoteClockInModalProps) {
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      streamRef.current = mediaStream;
      setStream(mediaStream);
    } catch (err) {
      console.error('Error accessing camera:', err);
      toast.error('Não foi possível acessar a câmera. Verifique as permissões.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStream(null);
    }
  }, []);

  const getLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocalização não é suportada pelo seu navegador.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setLocationError(null);
      },
      (error) => {
        console.error('Error getting location:', error);
        setLocationError('Não foi possível obter sua localização. Verifique as permissões do navegador.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, isOpen]);

  useEffect(() => {
    if (isOpen) {
      startCamera();
      getLocation();
    } else {
      stopCamera();
      setLocation(null);
      setLocationError(null);
      setIsScanning(false);
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera, getLocation]);

  const registerRemoteRecord = useMutation({
    mutationFn: async (capturedPhoto: Blob) => {
      if (!location) throw new Error('Localização é obrigatória');
      if (!capturedPhoto) throw new Error('Foto é obrigatória');

      const formData = new FormData();
      formData.append('latitude', String(location.lat));
      formData.append('longitude', String(location.lng));
      if (location.accuracy) {
        formData.append('gps_accuracy', String(location.accuracy));
      }
      formData.append('record_type', 'auto');
      formData.append('foto', capturedPhoto, 'photo.jpg');

      const res = await http.post<{ message?: string; locationStatus?: string; distance?: number }>('/records/remote', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return res.data;
    },
    onSuccess: (response) => {
      toast.success(response.message || 'Ponto registrado com sucesso.', { duration: 5000 });
      if (response.locationStatus === 'out_of_area') {
        toast.success(`Registro salvo fora do raio (${response.distance}m) com foto e localização para análise da liderança.`, { duration: 7000 });
      }
      queryClient.invalidateQueries({ queryKey: ['records', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['records', 'recent'] });
      queryClient.invalidateQueries({ queryKey: ['reports', 'attendance'] });
      queryClient.invalidateQueries({ queryKey: ['reports', 'dailySheet'] });
      queryClient.invalidateQueries({ queryKey: ['reports', 'hr-summary'] });
      queryClient.invalidateQueries({ queryKey: ['my-point', 'summary'] });
      queryClient.invalidateQueries({ queryKey: ['my-point', 'cumulative-bank-hours'] });
      queryClient.invalidateQueries({ queryKey: ['overview', 'hr-summary'] });
      setIsScanning(false);
      onClose();
    },
    onError: (error: unknown) => {
      setIsScanning(false);
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      toast.error(err.response?.data?.error || err.message || 'Erro ao registrar o ponto.');
    },
  });

  const captureAndSubmit = () => {
    if (!location) {
      toast.error('Aguarde a obtenção da localização.');
      return;
    }
    
    setIsScanning(true);
    
    // Simulate scan delay
    setTimeout(() => {
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Espelha o canvas para que a foto salva fique com a orientação correta
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          canvas.toBlob((blob) => {
            if (blob) {
              registerRemoteRecord.mutate(blob);
            } else {
              setIsScanning(false);
              toast.error('Erro ao capturar imagem da câmera.');
            }
          }, 'image/jpeg', 0.8);
        } else {
          setIsScanning(false);
        }
      } else {
        setIsScanning(false);
      }
    }, 1500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-xl font-semibold tracking-[-0.04em] text-[#191717]">Reconhecimento Facial</h3>
          <button onClick={onClose} className="rounded-full p-2 text-[#6e6a6a] hover:bg-[#f6f4f4]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5">
          <div className="text-center text-sm text-[#6e6a6a] mb-4">
            Posicione seu rosto no centro da câmera e aguarde o reconhecimento. <br />
            O sistema identificará automaticamente sua localização e o tipo de batida.
          </div>

          <div className="relative mx-auto aspect-[4/3] w-full max-w-lg overflow-hidden rounded-2xl border-4 border-[#ece8e8] bg-black shadow-inner">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover scale-x-[-1]"
            />
            <canvas ref={canvasRef} className="hidden" />
            
            {/* Scan Overlay */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-x-8 inset-y-8 rounded-[40px] border-[3px] border-white/30" />
              <div className="absolute left-8 top-8 h-12 w-12 rounded-tl-[40px] border-l-[4px] border-t-[4px] border-[#5fd1d1]" />
              <div className="absolute right-8 top-8 h-12 w-12 rounded-tr-[40px] border-r-[4px] border-t-[4px] border-[#5fd1d1]" />
              <div className="absolute bottom-8 left-8 h-12 w-12 rounded-bl-[40px] border-b-[4px] border-l-[4px] border-[#5fd1d1]" />
              <div className="absolute bottom-8 right-8 h-12 w-12 rounded-br-[40px] border-b-[4px] border-r-[4px] border-[#5fd1d1]" />
              
              {isScanning && (
                <div className="absolute left-0 top-0 h-full w-full bg-gradient-to-b from-transparent via-[#5fd1d1]/30 to-transparent animate-scan" />
              )}
            </div>
            
            {isScanning && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
                <div className="text-center text-white">
                  <div className="mb-3 inline-block h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent"></div>
                  <div className="font-semibold tracking-wide">Validando identidade...</div>
                </div>
              </div>
            )}
          </div>

          {locationError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-600 font-medium">
              {locationError}
              <button 
                type="button" 
                onClick={getLocation}
                className="mt-2 block w-full text-xs font-semibold hover:underline"
              >
                Tentar obter localização novamente
              </button>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1" disabled={isScanning}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={captureAndSubmit}
              disabled={!location || isScanning}
              className="btn-primary flex-1 bg-[#026666] hover:bg-[#014d4d]"
            >
              {isScanning ? 'Processando...' : 'Registrar Ponto'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
