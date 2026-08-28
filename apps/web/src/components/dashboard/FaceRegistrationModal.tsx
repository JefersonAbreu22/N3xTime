import { useCallback, useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import { Camera, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi } from '../../services/authApi';

type CaptureGuide = {
  label: string;
  instruction: string;
  matches: (yaw: number, pitch: number) => boolean;
};

// The preview is mirrored, while face-api analyses the original camera frame.
// Positive yaw therefore corresponds to the collaborator turning to their left.
const captureGuides: CaptureGuide[] = [
  { label: 'Frente', instruction: 'Olhe de frente para a câmera', matches: (yaw, pitch) => Math.abs(yaw) < 0.07 && Math.abs(pitch) < 0.14 },
  { label: 'Esquerda', instruction: 'Vire levemente para a sua esquerda', matches: (yaw) => yaw >= 0.12 },
  { label: 'Direita', instruction: 'Vire levemente para a sua direita', matches: (yaw) => yaw <= -0.12 },
  { label: 'Acima', instruction: 'Eleve levemente o rosto', matches: (_yaw, pitch) => pitch <= -0.13 },
  { label: 'Abaixo', instruction: 'Abaixe levemente o rosto', matches: (_yaw, pitch) => pitch >= 0.13 },
];

const MIN_FACE_WIDTH_RATIO = 0.18;
const MAX_FACE_WIDTH_RATIO = 0.64;
const MIN_DETECTION_SCORE = 0.7;
const DETECTION_OPTIONS = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });

const averagePoint = (points: faceapi.Point[]) => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / Math.max(points.length, 1),
  y: points.reduce((sum, point) => sum + point.y, 0) / Math.max(points.length, 1),
});

export default function FaceRegistrationModal({ user, onClose, onSuccess }: {
  user: { id: number; name: string; biometric_sample_count?: number };
  onClose: () => void;
  onSuccess: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const samplesRef = useRef<Array<{ descriptor: number[]; quality: number; label: string }>>([]);
  const processingRef = useRef(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [samples, setSamples] = useState<Array<{ descriptor: number[]; quality: number; label: string }>>([]);
  const [guidance, setGuidance] = useState('Inicializando câmera…');
  const [isReady, setIsReady] = useState(false);
  const [appendSamples, setAppendSamples] = useState((user.biometric_sample_count ?? 0) > 0);

  const addSample = useCallback((sample: { descriptor: number[]; quality: number; label: string }) => {
    samplesRef.current = [...samplesRef.current, sample];
    setSamples(samplesRef.current);
  }, []);

  useEffect(() => {
    let active = true;
    const videoElement = videoRef.current;
    const loadAndStart = async () => {
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
        ]);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (videoElement) videoElement.srcObject = stream;
        setModelsLoaded(true);
      } catch (error) {
        console.error('Erro ao iniciar cadastro facial:', error);
        toast.error('Não foi possível iniciar a câmera ou a IA facial.');
      }
    };
    void loadAndStart();
    return () => {
      active = false;
      const stream = videoElement?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!modelsLoaded || !isReady) return;
    const timer = window.setInterval(async () => {
      const video = videoRef.current;
      const index = samplesRef.current.length;
      if (!video || processingRef.current || index >= captureGuides.length || video.readyState < 2) return;
      processingRef.current = true;
      try {
        const detection = await faceapi.detectSingleFace(video, DETECTION_OPTIONS).withFaceLandmarks().withFaceDescriptor();
        if (!detection) {
          setGuidance('Não encontrei um rosto. Posicione-se dentro da moldura.');
          return;
        }
        const frameWidth = video.videoWidth || 1;
        const frameHeight = video.videoHeight || 1;
        const box = detection.detection.box;
        const widthRatio = box.width / frameWidth;
        const centerX = (box.x + box.width / 2) / frameWidth;
        const centerY = (box.y + box.height / 2) / frameHeight;
        if (widthRatio < MIN_FACE_WIDTH_RATIO) {
          setGuidance('Aproxime-se um pouco mais da câmera.');
          return;
        }
        if (widthRatio > MAX_FACE_WIDTH_RATIO) {
          setGuidance('Afaste-se um pouco da câmera.');
          return;
        }
        if (centerX < 0.22 || centerX > 0.78 || centerY < 0.16 || centerY > 0.84) {
          setGuidance('Centralize o rosto dentro da moldura.');
          return;
        }
        if ((detection.detection.score ?? 0) < MIN_DETECTION_SCORE) {
          setGuidance('Melhore a iluminação e mantenha o rosto nítido.');
          return;
        }

        const nose = detection.landmarks.getNose();
        const leftEye = averagePoint(detection.landmarks.getLeftEye());
        const rightEye = averagePoint(detection.landmarks.getRightEye());
        const mouth = averagePoint(detection.landmarks.getMouth());
        const noseTip = nose[Math.min(3, nose.length - 1)] ?? nose[0];
        const yaw = (noseTip.x - (box.x + box.width / 2)) / Math.max(box.width / 2, 1);
        const pitch = (noseTip.y - ((leftEye.y + rightEye.y) / 2 + mouth.y) / 2) / Math.max(box.height / 2, 1);
        const guide = captureGuides[index];
        if (!guide.matches(yaw, pitch)) {
          setGuidance(guide.instruction);
          return;
        }

        const quality = Math.round(Math.min(100, (detection.detection.score ?? 0) * 100 * Math.min(1, widthRatio / 0.28)));
        addSample({ descriptor: Array.from(detection.descriptor), quality, label: guide.label });
        setGuidance(index + 1 === captureGuides.length ? 'Coleta concluída. Revise e salve a biometria.' : `Amostra ${guide.label.toLowerCase()} capturada. ${captureGuides[index + 1].instruction}.`);
      } catch (error) {
        console.error('Erro ao analisar captura facial:', error);
        setGuidance('Não foi possível analisar este quadro. Mantenha-se na posição e tente novamente.');
      } finally {
        processingRef.current = false;
      }
    }, 450);
    return () => window.clearInterval(timer);
  }, [addSample, isReady, modelsLoaded]);

  const restart = () => {
    samplesRef.current = [];
    setSamples([]);
    setGuidance('Olhe de frente para a câmera.');
  };

  const handleSave = async () => {
    if (samples.length < captureGuides.length) {
      toast.error('Conclua as 5 posições guiadas para salvar uma biometria confiável.');
      return;
    }
    setIsSaving(true);
    try {
      await authApi.registerFace(user.id, samples.map((sample) => sample.descriptor), samples.map((sample) => sample.quality), !appendSamples);
      toast.success(appendSamples ? 'Amostras adicionadas e biometria reforçada.' : 'Biometria facial atualizada com sucesso.');
      onSuccess();
    } catch (error) {
      console.error('Erro ao salvar biometria:', error);
      toast.error('Erro ao salvar a biometria facial.');
    } finally {
      setIsSaving(false);
    }
  };

  const nextGuide = captureGuides[samples.length];
  return (
    <div className="modal-shell z-[60]">
      <div className="modal-card max-h-[92vh] max-w-3xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#ece8e8] bg-[#fcfbfb]/95 px-6 py-5 backdrop-blur-sm">
          <div><div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#026666]">Biometria facial guiada</div><h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#191717]">{user.name}</h3></div>
          <button onClick={onClose} className="btn-ghost" aria-label="Fechar">×</button>
        </div>
        <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="p-6 flex flex-col items-center border-b border-[#ece8e8] lg:border-b-0 lg:border-r">
            <div className="relative aspect-square w-full max-w-[20rem] overflow-hidden border border-[#d9d7d7] bg-[#f6f4f4] shadow-inner">
              <video ref={videoRef} autoPlay muted playsInline onLoadedMetadata={() => { setIsReady(true); setGuidance('Olhe de frente para a câmera.'); }} className="h-full w-full object-cover scale-x-[-1]" />
              <div className="pointer-events-none absolute inset-[14%] border-2 border-[#026666]/50" />
              {!modelsLoaded && <div className="absolute inset-0 flex items-center justify-center bg-[#f8f6f6] text-sm text-[#6e6a6a]">Carregando IA facial…</div>}
            </div>
            <p className="mt-5 text-center text-base font-semibold leading-6 text-[#026666]">{guidance}</p>
            <p className="mt-2 text-center text-sm leading-6 text-[#6e6a6a]">A coleta é automática: mantenha cada posição até a confirmação.</p>
          </div>
          <div className="p-6">
            <div className="surface-muted p-4"><div className="metric-label">Coleta em tempo real</div><div className="mt-2 text-xl font-semibold text-[#191717]">{samples.length}/5 amostras</div><div className="mt-2 text-sm text-[#6e6a6a]">{nextGuide ? `Próxima posição: ${nextGuide.instruction}.` : 'Todas as posições foram validadas.'}</div></div>
            <div className="mt-4 rounded border border-[#ece8e8] p-3 text-sm text-[#191717]">
              <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={appendSamples} onChange={(event) => setAppendSamples(event.target.checked)} className="mt-1" /><span><span className="font-semibold">Reforçar biometria existente</span><br /><span className="text-[#6e6a6a]">Adiciona estas amostras às já cadastradas, melhorando o reconhecimento em diferentes ângulos.</span></span></label>
            </div>
            <div className="mt-5 space-y-3">{captureGuides.map((guide, index) => { const sample = samples[index]; return <div key={guide.label} className="flex items-center justify-between border border-[#ece8e8] px-4 py-3"><div><div className="text-sm font-semibold text-[#191717]">{guide.label}</div><div className="text-xs text-[#6e6a6a]">{sample ? `Qualidade: ${sample.quality}%` : guide.instruction}</div></div><span className={`status-chip ${sample ? 'border-[#dceaea] bg-[#edf8f8] text-[#026666]' : 'border-[#ece8e8] bg-[#f6f4f4] text-[#191717]'}`}>{sample ? 'Coletada' : 'Aguardando'}</span></div>; })}</div>
          </div>
        </div>
        <div className="sticky bottom-0 z-10 flex flex-wrap justify-end gap-3 border-t border-[#ece8e8] bg-[#f8f6f6]/95 px-6 py-4 backdrop-blur-sm"><button onClick={onClose} className="btn-secondary">Cancelar</button><button onClick={restart} disabled={!samples.length || isSaving} className="btn-secondary"><RefreshCw className="h-4 w-4" />Reiniciar</button><button onClick={handleSave} disabled={!modelsLoaded || isSaving || samples.length < captureGuides.length} className="btn-primary"><Camera className="h-4 w-4" />{isSaving ? 'Salvando…' : appendSamples ? 'Reforçar biometria' : 'Salvar biometria'}</button></div>
      </div>
    </div>
  );
}
