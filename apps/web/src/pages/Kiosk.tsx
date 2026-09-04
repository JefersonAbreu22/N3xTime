import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import { Camera, CheckCircle, KeyRound, RefreshCw, ShieldCheck, Sun, XCircle, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import { authApi, clearKioskToken, getKioskToken } from '../services/authApi';
import { recordsApi } from '../services/recordsApi';
import Logo from '../components/Logo';

type ScanStatus = 'idle' | 'success' | 'error';
type ApiError = { response?: { status?: number; data?: { error?: string } } };
type FaceGuide = {
  detected: boolean;
  mapped: boolean;
  message: string;
  confidence?: number | null;
  box?: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
};
type PoseDirection = 'center' | 'left' | 'right';
type LivenessStep = 'align' | 'turn' | 'return' | 'verified';
type DiagnosticState = {
  distanceLabel: string;
  centeringLabel: string;
  livenessLabel: string;
  poseLabel: string;
  confidence: number | null;
  lastReason: string;
};
type LandmarkDetection = faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }, faceapi.FaceLandmarks68>;
type KioskRecordType = 'entry' | 'lunch_start' | 'lunch_end' | 'exit';
type RankedFaceCandidate = { label: string; distance: number };

const RECORD_TYPE_OPTIONS: Array<{ value: KioskRecordType; label: string }> = [
  { value: 'entry', label: 'Entrada' },
  { value: 'lunch_start', label: 'Saída almoço' },
  { value: 'lunch_end', label: 'Retorno almoço' },
  { value: 'exit', label: 'Saída empresa' },
];

const recordTypeLabel = (recordType: string) =>
  RECORD_TYPE_OPTIONS.find((option) => option.value === recordType)?.label ?? recordType;

const getTimeBasedSuggestion = (): KioskRecordType => {
  const hour = new Date().getHours();
  if (hour < 11) return 'entry';
  if (hour < 13) return 'lunch_start';
  if (hour < 15) return 'lunch_end';
  return 'exit';
};

const MIN_FACE_WIDTH_RATIO = 0.12;
const MIN_FACE_HEIGHT_RATIO = 0.22;
const MAX_FACE_WIDTH_RATIO = 0.62;
const MAX_FACE_HEIGHT_RATIO = 0.82;
const FACE_CENTER_MIN_X = 0.18;
const FACE_CENTER_MAX_X = 0.82;
const FACE_CENTER_MIN_Y = 0.12;
const FACE_CENTER_MAX_Y = 0.88;
// face-api matches by distance (lower is better), while the API validates a
// confidence score (higher is better). Keep both units explicit and aligned.
// Descriptors from the same person can vary noticeably with camera, lighting
// and the guided enrollment poses. 0.46 was overly strict and rejected valid
// frontal reads before they reached the API. This value keeps a practical
// camera tolerance while rejecting weak matches more aggressively.
const FACE_MATCH_MAX_DISTANCE = 0.48;
const MIN_BIOMETRIC_SCORE = 0.52;
const MIN_FACE_CANDIDATE_DISTANCE_GAP = 0.06;
const REQUIRED_CONSISTENT_FACE_FRAMES = 2;
const REQUIRED_LIVENESS_FRAMES = 2;
const LIVENESS_SAME_FACE_MAX_DISTANCE = 0.58;
const MIN_DETECTION_QUALITY = 0.65;
const LIVENESS_CENTER_TOLERANCE = 0.08;
const LIVENESS_TURN_TOLERANCE = 0.12;
// Faster feedback makes the liveness challenge feel immediate without running
// more work than the camera's configured 10–12 fps can provide.
// The in-flight lock prevents concurrent inferences on slower terminals.
const SCAN_INTERVAL_MS = 240;
const DETECTION_OPTIONS = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.52, maxResults: 3 });
const DAILY_CACHE_REFRESH_HOUR = 6;
const CACHE_CYCLE_STORAGE_KEY = 'n3xtime-kiosk-cache-cycle';
const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: 'user',
    width: { ideal: 960, max: 1280 },
    height: { ideal: 720, max: 960 },
    frameRate: { ideal: 15, max: 24 },
  },
};

const getDailyCacheCycle = (date = new Date()) => {
  const adjusted = new Date(date);
  adjusted.setHours(adjusted.getHours() - DAILY_CACHE_REFRESH_HOUR);
  const year = adjusted.getFullYear();
  const month = String(adjusted.getMonth() + 1).padStart(2, '0');
  const day = String(adjusted.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getNextDailyCacheRefresh = (date = new Date()) => {
  const next = new Date(date);
  next.setHours(DAILY_CACHE_REFRESH_HOUR, 0, 0, 0);
  if (next.getTime() <= date.getTime()) next.setDate(next.getDate() + 1);
  return next;
};

const getVersionedModelUri = () => `/models/cache-${getDailyCacheCycle()}`;

const buildDeviceInfo = () =>
  JSON.stringify({
    kiosk: true,
    ua: navigator.userAgent,
    platform: navigator.platform,
  });

const averageLandmarkPoint = (points: faceapi.Point[]) => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / Math.max(points.length, 1),
  y: points.reduce((sum, point) => sum + point.y, 0) / Math.max(points.length, 1),
});

const rankFaceCandidates = (
  candidates: faceapi.LabeledFaceDescriptors[],
  descriptor: Float32Array
): RankedFaceCandidate[] => candidates
  .map((candidate) => ({
    label: candidate.label,
    distance: Math.min(...candidate.descriptors.map((reference) => faceapi.euclideanDistance(reference, descriptor))),
  }))
  .sort((left, right) => left.distance - right.distance);

export default function Kiosk() {
  const navigate = useNavigate();
  const { companySlug: routeCompanySlug } = useParams<{ companySlug?: string }>();
  const companySlug = routeCompanySlug?.trim().toLowerCase();
  const videoRef = useRef<HTMLVideoElement>(null);
  const matcherRef = useRef<faceapi.FaceMatcher | null>(null);
  const labeledFacesRef = useRef<faceapi.LabeledFaceDescriptors[]>([]);
  const pendingFaceMatchRef = useRef<{ label: string; count: number } | null>(null);
  const livenessEvidenceRef = useRef({ align: 0, turn: 0, return: 0 });
  const livenessAnchorDescriptorRef = useRef<Float32Array | null>(null);
  const missingFaceFramesRef = useRef(0);
  const intervalRef = useRef<number | null>(null);
  const lastRegisteredRef = useRef<{ userId: number; at: number } | null>(null);
  const lastFailureLogRef = useRef<{ reason: string; at: number } | null>(null);
  const isClaimingTerminalRef = useRef(false);
  const isProcessingFrameRef = useRef(false);
  const isRecognitionEnabledRef = useRef(false);
  const isStartingRecognitionRef = useRef(false);
  const modelLoadPromiseRef = useRef<Promise<void> | null>(null);
  const modelCacheCycleRef = useRef<string | null>(null);
  const cacheRefreshPendingRef = useRef(false);
  const statusRef = useRef<ScanStatus>('idle');
  const livenessStepRef = useRef<LivenessStep>('align');
  const livenessDirectionRef = useRef<'left' | 'right'>('left');
  const suggestedRecordTypesRef = useRef(new Map<number, KioskRecordType | null>());
  const isRecordTypeManuallySelectedRef = useRef(false);

  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [employeeName, setEmployeeName] = useState<string | null>(null);
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [facesCount, setFacesCount] = useState<number>(0);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [kioskToken, setKioskToken] = useState<string | null>(() => getKioskToken());
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [selectedRecordType, setSelectedRecordType] = useState<KioskRecordType>(getTimeBasedSuggestion);
  const selectedRecordTypeRef = useRef<KioskRecordType>(selectedRecordType);
  const [isSubmittingPin, setIsSubmittingPin] = useState(false);
  const [accessKey, setAccessKey] = useState('');
  const [isSubmittingAccessKey, setIsSubmittingAccessKey] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [terminalEnabled, setTerminalEnabled] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [companyLookupError, setCompanyLookupError] = useState<string | null>(null);
  const [faceGuide, setFaceGuide] = useState<FaceGuide | null>(null);
  const [isRecognitionEnabled, setIsRecognitionEnabled] = useState(false);
  const [isStartingRecognition, setIsStartingRecognition] = useState(false);
  const [isFacesLoading, setIsFacesLoading] = useState(false);
  const [livenessStep, setLivenessStep] = useState<LivenessStep>('align');
  const [livenessDirection, setLivenessDirection] = useState<'left' | 'right'>('left');
  const [isLowLight, setIsLowLight] = useState(false);
  const [isLightAssistEnabled, setIsLightAssistEnabled] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [diagnosticState, setDiagnosticState] = useState<DiagnosticState>({
    distanceLabel: 'Aguardando',
    centeringLabel: 'Aguardando',
    livenessLabel: 'Aguardando início',
    poseLabel: 'Centro',
    confidence: null,
    lastReason: 'Inicie o reconhecimento para visualizar o diagnóstico.',
  });

  useEffect(() => {
    selectedRecordTypeRef.current = selectedRecordType;
  }, [selectedRecordType]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    livenessStepRef.current = livenessStep;
  }, [livenessStep]);

  useEffect(() => {
    livenessDirectionRef.current = livenessDirection;
  }, [livenessDirection]);

  useEffect(() => {
    isRecognitionEnabledRef.current = isRecognitionEnabled;
  }, [isRecognitionEnabled]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const refreshBrowserCache = async () => {
      const cacheCycle = getDailyCacheCycle();
      try {
        if ('caches' in window) {
          const cacheNames = await window.caches.keys();
          await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
        }
        window.localStorage.setItem(CACHE_CYCLE_STORAGE_KEY, cacheCycle);
      } catch (error) {
        console.warn('Não foi possível limpar o Cache Storage do navegador:', error);
      }

      if (isRecognitionEnabledRef.current || isProcessingFrameRef.current || isStartingRecognitionRef.current) {
        cacheRefreshPendingRef.current = true;
        const reloadWhenIdle = () => {
          if (cancelled) return;
          if (isRecognitionEnabledRef.current || isProcessingFrameRef.current || isStartingRecognitionRef.current) {
            window.setTimeout(reloadWhenIdle, 1_000);
            return;
          }
          cacheRefreshPendingRef.current = false;
          window.location.reload();
        };
        window.setTimeout(reloadWhenIdle, 1_000);
        return;
      }
      modelCacheCycleRef.current = null;
      setIsModelLoaded(false);
      window.location.reload();
    };

    const scheduleNextRefresh = () => {
      const delay = getNextDailyCacheRefresh().getTime() - Date.now();
      timer = window.setTimeout(async () => {
        await refreshBrowserCache();
        if (!cancelled) scheduleNextRefresh();
      }, delay);
    };

    let storedCycle: string | null = null;
    try {
      storedCycle = window.localStorage.getItem(CACHE_CYCLE_STORAGE_KEY);
      if (!storedCycle) window.localStorage.setItem(CACHE_CYCLE_STORAGE_KEY, getDailyCacheCycle());
    } catch (error) {
      console.warn('Não foi possível consultar o ciclo de cache do totem:', error);
    }

    if (storedCycle && storedCycle !== getDailyCacheCycle()) {
      void refreshBrowserCache();
    } else {
      scheduleNextRefresh();
    }

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCompanyLookupError(null);

    if (!companySlug) {
      setCompanyName(null);
      return () => { cancelled = true; };
    }

    authApi.getKioskCompany(companySlug)
      .then((response) => {
        if (!cancelled) setCompanyName(response.data.name);
      })
      .catch((error: ApiError) => {
        if (!cancelled) {
          setCompanyName(null);
          setCompanyLookupError(error.response?.data?.error || 'Empresa não encontrada ou indisponível.');
        }
      });

    return () => { cancelled = true; };
  }, [companySlug]);

  useEffect(() => {
    const refreshTimeSuggestion = () => {
      if (!isRecordTypeManuallySelectedRef.current) {
        setSelectedRecordType(getTimeBasedSuggestion());
      }
    };
    refreshTimeSuggestion();
    const timer = window.setInterval(refreshTimeSuggestion, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const ensureModelsLoaded = async () => {
    const cacheCycle = getDailyCacheCycle();
    if (isModelLoaded && modelCacheCycleRef.current === cacheCycle) return;
    if (modelLoadPromiseRef.current) return modelLoadPromiseRef.current;

    const modelUri = getVersionedModelUri();
    const loading = Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(modelUri),
      faceapi.nets.faceLandmark68Net.loadFromUri(modelUri),
      faceapi.nets.faceRecognitionNet.loadFromUri(modelUri),
    ]).then(() => {
      modelCacheCycleRef.current = cacheCycle;
      setIsModelLoaded(true);
    }).catch((error) => {
      console.error('Model loading error:', error);
      setFatalError('Os modelos faciais do totem não foram encontrados ou estão incompletos.');
      throw error;
    }).finally(() => {
      modelLoadPromiseRef.current = null;
    });

    modelLoadPromiseRef.current = loading;
    return loading;
  };

  const stopVideo = () => {
    setIsCameraReady(false);
    setFaceGuide(null);
    isRecognitionEnabledRef.current = false;
    setIsRecognitionEnabled(false);
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      void stream.getVideoTracks()[0]?.applyConstraints({ advanced: [{ torch: false }] } as unknown as MediaTrackConstraints).catch(() => undefined);
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsLightAssistEnabled(false);
    setTorchAvailable(false);
  };

  const startVideo = async () => {
    const currentStream = videoRef.current?.srcObject as MediaStream | null;
    if (currentStream?.getVideoTracks().some((track) => track.readyState === 'live')) {
      setIsCameraReady(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('Elemento de vídeo indisponível.');
      }

      video.srcObject = stream;
      const capabilities = stream.getVideoTracks()[0]?.getCapabilities?.() as { torch?: boolean } | undefined;
      setTorchAvailable(Boolean(capabilities?.torch));
      if (video.readyState < 2) {
        await new Promise<void>((resolve) => video.addEventListener('loadedmetadata', () => resolve(), { once: true }));
      }
      await video.play();
      setIsCameraReady(true);
    } catch (err) {
      console.error('Error accessing webcam:', err);
      stopVideo();
      setFatalError('A câmera do totem não pôde ser iniciada. Verifique a permissão do navegador e se outro aplicativo está usando a câmera.');
      toast.error('Não foi possível acessar a câmera.');
      throw err;
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    return () => {
      const stream = video?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
  }, []);

  // Sample a tiny frame every two seconds. This is intentionally independent of
  // face detection, so the low-light hint adds virtually no recognition cost.
  useEffect(() => {
    if (!isCameraReady) return;
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 24;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const evaluateLight = () => {
      const video = videoRef.current;
      if (!context || !video || video.readyState < 2) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let luminance = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        luminance += pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
      }
      setIsLowLight(luminance / (pixels.length / 4) < 58);
    };
    evaluateLight();
    const timer = window.setInterval(evaluateLight, 2000);
    return () => window.clearInterval(timer);
  }, [isCameraReady]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const syncTerminalAccess = async () => {
      if (!kioskToken) {
        setTerminalEnabled(false);
        return;
      }
      try {
        const statusResponse = await authApi.getKioskStatus(true);
        if (cancelled) return;

        if (companySlug && statusResponse.data.company.slug !== companySlug) {
          clearKioskToken();
          setKioskToken(null);
          setTerminalEnabled(false);
          matcherRef.current = null;
          setFacesCount(0);
          stopVideo();
          return;
        }

        const enabled = Boolean(statusResponse.data.terminalEnabled);
        setCompanyName(statusResponse.data.company.name);
        setTerminalEnabled(enabled);

        if (!enabled) {
          clearKioskToken();
          setKioskToken(null);
          matcherRef.current = null;
          setFacesCount(0);
          stopVideo();
          setFatalError(null);
          return;
        }

        // Removed automatic claim. Terminal must be authenticated manually via access key.
      } catch (error: unknown) {
        if (cancelled) return;
        console.error('Kiosk public access sync error:', error);
        clearKioskToken();
        setKioskToken(null);
        setTerminalEnabled(false);
        matcherRef.current = null;
        setFacesCount(0);
        stopVideo();
        setFatalError(null);
      } finally {
        if (!cancelled) {
          isClaimingTerminalRef.current = false;
          timer = window.setTimeout(syncTerminalAccess, 5000);
        }
      }
    };

    syncTerminalAccess();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [kioskToken, fatalError, companySlug]);

  const canPrepareRecognition = useMemo(
    () => Boolean(kioskToken) && terminalEnabled && !fatalError,
    [kioskToken, terminalEnabled, fatalError]
  );

  const canScan = useMemo(
    () => canPrepareRecognition && isModelLoaded && isCameraReady,
    [canPrepareRecognition, isCameraReady, isModelLoaded]
  );

  useEffect(() => {
    const loadFaces = async () => {
      setIsFacesLoading(true);
      try {
        setFatalError(null);
        const res = await authApi.getFaces(true);
        const faces = res.data ?? [];
        setFacesCount(faces.length);
        suggestedRecordTypesRef.current = new Map(
          faces.map((face) => [face.id, face.suggestedRecordType ?? null])
        );
        const labeled = faces
          .map((face) => {
            const sourceDescriptors =
              Array.isArray(face.sampleDescriptors) && face.sampleDescriptors.length > 0
                ? face.sampleDescriptors
                : Array.isArray(face.descriptor) && face.descriptor.length > 0
                  ? [face.descriptor]
                  : [];

            const descriptors = sourceDescriptors
              .filter((descriptor) => Array.isArray(descriptor) && descriptor.length > 0)
              .map((descriptor) => new Float32Array(descriptor));

            if (!descriptors.length) return null;
            return new faceapi.LabeledFaceDescriptors(`${face.id}|${face.name}`, descriptors);
          })
          .filter((face): face is faceapi.LabeledFaceDescriptors => Boolean(face));
        labeledFacesRef.current = labeled;
        matcherRef.current = labeled.length ? new faceapi.FaceMatcher(labeled, FACE_MATCH_MAX_DISTANCE) : null;
      } catch (error: unknown) {
        console.error('Load faces error:', error);
        if ((error as ApiError)?.response?.status === 401 || (error as ApiError)?.response?.status === 403) {
          clearKioskToken();
          setKioskToken(null);
          setTerminalEnabled(false);
          setFacesCount(0);
          matcherRef.current = null;
          labeledFacesRef.current = [];
          pendingFaceMatchRef.current = null;
          setFatalError('Sessão do terminal encerrada. Aguarde nova liberação do administrador.');
          return;
        }
        setFatalError('Não foi possível carregar as faces cadastradas.');
      } finally {
        setIsFacesLoading(false);
      }
    };

    if (canPrepareRecognition) {
      loadFaces();
    } else {
      setIsFacesLoading(false);
      matcherRef.current = null;
      labeledFacesRef.current = [];
      pendingFaceMatchRef.current = null;
      setFacesCount(0);
    }
  }, [canPrepareRecognition]);

  const resetStatus = () => {
    setStatus('idle');
    setEmployeeName(null);
    setStatusDetail(null);
  };

  const resetLivenessFlow = (
    message = 'Alinhe o rosto ao centro para iniciar a prova de vida.',
    challengeDirection: 'left' | 'right' = 'left'
  ) => {
    livenessStepRef.current = 'align';
    livenessDirectionRef.current = challengeDirection;
    livenessEvidenceRef.current = { align: 0, turn: 0, return: 0 };
    livenessAnchorDescriptorRef.current = null;
    missingFaceFramesRef.current = 0;
    setLivenessStep('align');
    setLivenessDirection(challengeDirection);
    setDiagnosticState({
      distanceLabel: 'Aguardando',
      centeringLabel: 'Aguardando',
      livenessLabel: 'Alinhe o rosto',
      poseLabel: 'Centro',
      confidence: null,
      lastReason: message,
    });
  };

  const estimateFacePose = (detection: LandmarkDetection) => {
    const box = detection.detection.box;
    const nose = detection.landmarks.getNose();
    const leftEye = averageLandmarkPoint(detection.landmarks.getLeftEye());
    const rightEye = averageLandmarkPoint(detection.landmarks.getRightEye());
    const mouth = averageLandmarkPoint(detection.landmarks.getMouth());
    const noseTip = nose[Math.min(3, nose.length - 1)] ?? nose[0];
    const faceCenterX = box.x + box.width / 2;
    const eyeCenterY = (leftEye.y + rightEye.y) / 2;
    const verticalReferenceY = (eyeCenterY + mouth.y) / 2;

    return {
      yaw: Number(((noseTip.x - faceCenterX) / Math.max(box.width / 2, 1)).toFixed(3)),
      pitch: Number(((noseTip.y - verticalReferenceY) / Math.max(box.height / 2, 1)).toFixed(3)),
    };
  };

  const getPoseDirection = (yaw: number): PoseDirection => {
    // The displayed preview is mirrored but landmarks come from the original
    // camera image. Map the directions to the collaborator's own left/right.
    if (yaw <= -LIVENESS_CENTER_TOLERANCE) return 'right';
    if (yaw >= LIVENESS_CENTER_TOLERANCE) return 'left';
    return 'center';
  };

  const logBiometricFailure = async ({
    reason,
    score,
    metadata,
  }: {
    reason: string;
    score?: number | null;
    metadata?: Record<string, unknown>;
  }) => {
    const now = Date.now();
    const lastFailure = lastFailureLogRef.current;
    if (lastFailure && lastFailure.reason === reason && now - lastFailure.at < 8000) {
      return;
    }

    lastFailureLogRef.current = { reason, at: now };
    try {
      await recordsApi.logBiometricFailure({
        reason,
        biometric_score: score ?? null,
        biometric_threshold: MIN_BIOMETRIC_SCORE,
        device_info: buildDeviceInfo(),
        metadata,
      });
    } catch (error) {
      console.error('Erro ao registrar falha biométrica:', error);
    }
  };

  const stopRecognition = (message?: string) => {
    pendingFaceMatchRef.current = null;
    stopVideo();
    resetLivenessFlow(message || 'Reconhecimento em espera.');
    setFaceGuide(
      message
        ? {
            detected: false,
            mapped: false,
            message,
          }
        : null
    );
    if (cacheRefreshPendingRef.current) {
      cacheRefreshPendingRef.current = false;
      window.setTimeout(() => window.location.reload(), 0);
    }
  };

  const buildFaceGuide = (
    detection: LandmarkDetection,
    mapped: boolean,
    message: string,
    confidence?: number | null
  ): FaceGuide | null => {
    const videoEl = videoRef.current;
    if (!videoEl) return null;

    const width = videoEl.videoWidth || 1;
    const height = videoEl.videoHeight || 1;
    const containerWidth = videoEl.clientWidth || width;
    const containerHeight = videoEl.clientHeight || height;
    const scale = Math.max(containerWidth / width, containerHeight / height);
    const renderedWidth = width * scale;
    const renderedHeight = height * scale;
    const cropX = Math.max((renderedWidth - containerWidth) / 2, 0);
    const cropY = Math.max((renderedHeight - containerHeight) / 2, 0);
    const box = detection.detection.box;
    const widthPx = box.width * scale;
    const heightPx = box.height * scale;
    const topPx = box.y * scale - cropY;
    const leftPx = containerWidth - ((box.x + box.width) * scale - cropX);

    const clampedTop = Math.min(Math.max(topPx, 0), Math.max(containerHeight - heightPx, 0));
    const clampedLeft = Math.min(Math.max(leftPx, 0), Math.max(containerWidth - widthPx, 0));

    return {
      detected: true,
      mapped,
      message,
      confidence: confidence ?? null,
      box: {
        top: Number(((clampedTop / containerHeight) * 100).toFixed(2)),
        left: Number(((clampedLeft / containerWidth) * 100).toFixed(2)),
        width: Number(((widthPx / containerWidth) * 100).toFixed(2)),
        height: Number(((heightPx / containerHeight) * 100).toFixed(2)),
      },
    };
  };

  const evaluateFaceReadiness = (detection: LandmarkDetection) => {
    const videoEl = videoRef.current;
    if (!videoEl) {
      return { ready: false, message: 'Inicializando leitura facial.' };
    }

    const frameWidth = videoEl.videoWidth || 1;
    const frameHeight = videoEl.videoHeight || 1;
    const box = detection.detection.box;
    const widthRatio = box.width / frameWidth;
    const heightRatio = box.height / frameHeight;
    const centerX = (box.x + box.width / 2) / frameWidth;
    const centerY = (box.y + box.height / 2) / frameHeight;

    if (widthRatio < MIN_FACE_WIDTH_RATIO || heightRatio < MIN_FACE_HEIGHT_RATIO) {
      return {
        ready: false,
        message: 'Aproxime um pouco mais o rosto da câmera para iniciar a leitura.',
        reason: 'face_too_far',
        distanceLabel: 'Muito distante',
        centeringLabel: 'Dentro da área',
      };
    }

    if (widthRatio > MAX_FACE_WIDTH_RATIO || heightRatio > MAX_FACE_HEIGHT_RATIO) {
      return {
        ready: false,
        message: 'Afaste um pouco o rosto da câmera para enquadrá-lo por completo.',
        reason: 'face_too_close',
        distanceLabel: 'Muito próximo',
        centeringLabel: 'Dentro da área',
      };
    }

    if (centerX < FACE_CENTER_MIN_X || centerX > FACE_CENTER_MAX_X || centerY < FACE_CENTER_MIN_Y || centerY > FACE_CENTER_MAX_Y) {
      return {
        ready: false,
        message: 'Centralize o rosto dentro da moldura para validar a biometria.',
        reason: 'face_off_center',
        distanceLabel: 'Ideal',
        centeringLabel: 'Ajuste necessário',
      };
    }

    return {
      ready: true,
      message: 'Rosto próximo e centralizado. Validando biometria.',
      reason: 'ready',
      distanceLabel: 'Ideal',
      centeringLabel: 'Ideal',
    };
  };

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!canScan || !videoEl || !isRecognitionEnabled) return;

    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = window.setInterval(async () => {
        if (isProcessingFrameRef.current || !matcherRef.current || statusRef.current !== 'idle' || !videoRef.current) return;

        isProcessingFrameRef.current = true;
        try {

        const detections = await faceapi
          .detectAllFaces(videoRef.current, DETECTION_OPTIONS)
          .withFaceLandmarks()
          .withFaceDescriptors();

        if (detections.length === 0) {
          pendingFaceMatchRef.current = null;
          missingFaceFramesRef.current += 1;
          const livenessWasReset = missingFaceFramesRef.current >= 3 && livenessStepRef.current !== 'align';
          if (livenessWasReset) {
            resetLivenessFlow('O rosto saiu da câmera. A prova de vida foi reiniciada.', livenessDirectionRef.current);
          }
          setDiagnosticState((previous) => ({
            ...previous,
            poseLabel: 'Sem rosto',
            confidence: null,
            livenessLabel: livenessWasReset ? 'Prova reiniciada' : livenessStep === 'verified' ? 'Prova de vida validada' : 'Aguardando rosto',
            lastReason: livenessWasReset ? 'O rosto saiu da câmera; recomece olhando para o centro.' : 'Nenhum rosto detectado na área de leitura.',
          }));
          setFaceGuide({
            detected: false,
            mapped: false,
            message: 'Nenhum rosto detectado. Posicione-se dentro da área de leitura.',
          });
          return;
        }

        if (detections.length > 1) {
          pendingFaceMatchRef.current = null;
          resetLivenessFlow('Mais de uma pessoa apareceu na câmera. Deixe somente o colaborador na área de leitura.', livenessDirectionRef.current);
          setDiagnosticState({
            distanceLabel: 'Aguardando',
            centeringLabel: 'Área ocupada',
            livenessLabel: 'Leitura bloqueada',
            poseLabel: `${detections.length} rostos`,
            confidence: null,
            lastReason: 'Mais de um rosto foi detectado. Nenhuma identidade será processada.',
          });
          void logBiometricFailure({ reason: 'multiple_faces_detected', metadata: { faceCount: detections.length } });
          setFaceGuide({ detected: false, mapped: false, message: 'Leitura pausada: deixe apenas uma pessoa em frente à câmera.' });
          return;
        }

        missingFaceFramesRef.current = 0;
        const detection = detections[0];

        if (detection.detection.score < MIN_DETECTION_QUALITY) {
          pendingFaceMatchRef.current = null;
          const qualityMessage = 'Imagem pouco nítida. Melhore a iluminação e mantenha o rosto parado.';
          setDiagnosticState({
            distanceLabel: 'Verificando',
            centeringLabel: 'Verificando',
            livenessLabel: 'Qualidade insuficiente',
            poseLabel: 'Rosto detectado',
            confidence: null,
            lastReason: qualityMessage,
          });
          setFaceGuide(buildFaceGuide(detection, false, qualityMessage));
          return;
        }

        const faceReadiness = evaluateFaceReadiness(detection);
        const pose = estimateFacePose(detection);
        const poseDirection = getPoseDirection(pose.yaw);
        const poseLabel = poseDirection === 'left' ? 'Virado à esquerda' : poseDirection === 'right' ? 'Virado à direita' : 'Centralizado';

        const livenessAnchor = livenessAnchorDescriptorRef.current;
        if (livenessStepRef.current !== 'align' && livenessAnchor) {
          const continuityDistance = faceapi.euclideanDistance(livenessAnchor, detection.descriptor);
          if (continuityDistance > LIVENESS_SAME_FACE_MAX_DISTANCE) {
            pendingFaceMatchRef.current = null;
            resetLivenessFlow('O rosto mudou durante o desafio. A prova de vida foi reiniciada.', livenessDirectionRef.current);
            void logBiometricFailure({
              reason: 'liveness_identity_changed',
              metadata: { continuityDistance: Number(continuityDistance.toFixed(4)), maxDistance: LIVENESS_SAME_FACE_MAX_DISTANCE },
            });
            setFaceGuide(buildFaceGuide(detection, false, 'A pessoa mudou durante a leitura. Recomece olhando para o centro.'));
            return;
          }
        }
        if (!faceReadiness.ready) {
          pendingFaceMatchRef.current = null;
          setDiagnosticState({
            distanceLabel: faceReadiness.distanceLabel,
            centeringLabel: faceReadiness.centeringLabel,
            livenessLabel:
              livenessStep === 'verified'
                ? 'Prova de vida validada'
                : livenessStep === 'turn'
                  ? 'Aguardando movimento'
                  : livenessStep === 'return'
                    ? `Retorne ao centro (${livenessDirection === 'left' ? 'esquerda validada' : 'direita validada'})`
                    : 'Alinhe o rosto',
            poseLabel,
            confidence: null,
            lastReason: faceReadiness.message,
          });
          void logBiometricFailure({
            reason: faceReadiness.reason,
            metadata: {
              yaw: pose.yaw,
              pitch: pose.pitch,
              poseDirection,
            },
          });
          setFaceGuide(buildFaceGuide(detection, false, faceReadiness.message));
          return;
        }

        let nextLivenessStep = livenessStep;
        let livenessMessage = 'Prova de vida validada. Conferindo biometria.';

        if (livenessStep === 'align') {
          if (poseDirection !== 'center' || Math.abs(pose.yaw) > LIVENESS_CENTER_TOLERANCE || Math.abs(pose.pitch) > 0.16) {
            livenessEvidenceRef.current.align = 0;
            livenessMessage = 'Olhe de frente para a câmera para iniciar a prova de vida.';
            setDiagnosticState({
              distanceLabel: faceReadiness.distanceLabel,
              centeringLabel: faceReadiness.centeringLabel,
              livenessLabel: 'Alinhe o rosto',
              poseLabel,
              confidence: null,
              lastReason: livenessMessage,
            });
            void logBiometricFailure({
              reason: 'liveness_alignment_pending',
              metadata: {
                yaw: pose.yaw,
                pitch: pose.pitch,
                poseDirection,
              },
            });
            setFaceGuide(buildFaceGuide(detection, false, livenessMessage));
            return;
          }
          livenessEvidenceRef.current.align += 1;
          if (livenessEvidenceRef.current.align < REQUIRED_LIVENESS_FRAMES) {
            const stableMessage = 'Ótimo. Mantenha o rosto de frente por mais um instante.';
            setDiagnosticState({
              distanceLabel: faceReadiness.distanceLabel,
              centeringLabel: faceReadiness.centeringLabel,
              livenessLabel: 'Confirmando posição inicial',
              poseLabel,
              confidence: null,
              lastReason: stableMessage,
            });
            setFaceGuide(buildFaceGuide(detection, false, stableMessage));
            return;
          }
          livenessAnchorDescriptorRef.current = new Float32Array(detection.descriptor);
          nextLivenessStep = 'turn';
          livenessStepRef.current = 'turn';
          setLivenessStep('turn');
          livenessMessage = `Frente validada. Gire o rosto levemente para a ${livenessDirection === 'left' ? 'esquerda' : 'direita'}.`;
          setDiagnosticState({
            distanceLabel: faceReadiness.distanceLabel,
            centeringLabel: faceReadiness.centeringLabel,
            livenessLabel: `Gire para a ${livenessDirection === 'left' ? 'esquerda' : 'direita'}`,
            poseLabel,
            confidence: null,
            lastReason: livenessMessage,
          });
          setFaceGuide(buildFaceGuide(detection, false, livenessMessage));
          return;
        }

        if (livenessStep === 'turn') {
          if (poseDirection !== livenessDirection || Math.abs(pose.yaw) < LIVENESS_TURN_TOLERANCE) {
            livenessEvidenceRef.current.turn = 0;
            livenessMessage = `Gire o rosto para a ${livenessDirection === 'left' ? 'esquerda' : 'direita'} para continuar.`;
            setDiagnosticState({
              distanceLabel: faceReadiness.distanceLabel,
              centeringLabel: faceReadiness.centeringLabel,
              livenessLabel: `Gire para a ${livenessDirection === 'left' ? 'esquerda' : 'direita'}`,
              poseLabel,
              confidence: null,
              lastReason: livenessMessage,
            });
            void logBiometricFailure({
              reason: 'liveness_turn_pending',
              metadata: {
                yaw: pose.yaw,
                pitch: pose.pitch,
                poseDirection,
                expectedDirection: livenessDirection,
              },
            });
            setFaceGuide(buildFaceGuide(detection, false, livenessMessage));
            return;
          }
          livenessEvidenceRef.current.turn += 1;
          if (livenessEvidenceRef.current.turn < REQUIRED_LIVENESS_FRAMES) {
            const turnConfirmation = 'Movimento detectado. Mantenha essa posição por mais um instante.';
            setDiagnosticState({
              distanceLabel: faceReadiness.distanceLabel,
              centeringLabel: faceReadiness.centeringLabel,
              livenessLabel: 'Confirmando movimento',
              poseLabel,
              confidence: null,
              lastReason: turnConfirmation,
            });
            setFaceGuide(buildFaceGuide(detection, false, turnConfirmation));
            return;
          }
          nextLivenessStep = 'return';
          livenessStepRef.current = 'return';
          setLivenessStep('return');
          livenessMessage = `Movimento para a ${livenessDirection === 'left' ? 'esquerda' : 'direita'} detectado. Retorne o rosto ao centro.`;
          setDiagnosticState({
            distanceLabel: faceReadiness.distanceLabel,
            centeringLabel: faceReadiness.centeringLabel,
            livenessLabel: 'Retorne ao centro',
            poseLabel,
            confidence: null,
            lastReason: livenessMessage,
          });
          setFaceGuide(buildFaceGuide(detection, false, livenessMessage));
          return;
        }

        if (livenessStep === 'return') {
          if (poseDirection !== 'center' || Math.abs(pose.yaw) > LIVENESS_CENTER_TOLERANCE) {
            livenessEvidenceRef.current.return = 0;
            livenessMessage = 'Retorne o rosto ao centro para concluir a prova de vida.';
            setDiagnosticState({
              distanceLabel: faceReadiness.distanceLabel,
              centeringLabel: faceReadiness.centeringLabel,
              livenessLabel: 'Retorne ao centro',
              poseLabel,
              confidence: null,
              lastReason: livenessMessage,
            });
            void logBiometricFailure({
              reason: 'liveness_return_pending',
              metadata: {
                yaw: pose.yaw,
                pitch: pose.pitch,
                poseDirection,
                movementDirection: livenessDirection,
              },
            });
            setFaceGuide(buildFaceGuide(detection, false, livenessMessage));
            return;
          }
          livenessEvidenceRef.current.return += 1;
          if (livenessEvidenceRef.current.return < REQUIRED_LIVENESS_FRAMES) {
            const returnConfirmation = 'Centro detectado. Mantenha o rosto parado para concluir.';
            setDiagnosticState({
              distanceLabel: faceReadiness.distanceLabel,
              centeringLabel: faceReadiness.centeringLabel,
              livenessLabel: 'Confirmando retorno',
              poseLabel,
              confidence: null,
              lastReason: returnConfirmation,
            });
            setFaceGuide(buildFaceGuide(detection, false, returnConfirmation));
            return;
          }
          nextLivenessStep = 'verified';
          livenessStepRef.current = 'verified';
          setLivenessStep('verified');
          livenessMessage = 'Prova de vida validada. Conferindo biometria.';
        }

        if (
          nextLivenessStep === 'verified' &&
          (poseDirection !== 'center' || Math.abs(pose.yaw) > LIVENESS_CENTER_TOLERANCE || Math.abs(pose.pitch) > 0.16)
        ) {
          pendingFaceMatchRef.current = null;
          const frontFacingMessage = 'Mantenha o rosto de frente enquanto confirmamos a identidade.';
          setDiagnosticState({
            distanceLabel: faceReadiness.distanceLabel,
            centeringLabel: faceReadiness.centeringLabel,
            livenessLabel: 'Prova de vida validada',
            poseLabel,
            confidence: null,
            lastReason: frontFacingMessage,
          });
          setFaceGuide(buildFaceGuide(detection, false, frontFacingMessage));
          return;
        }

        const rankedCandidates = rankFaceCandidates(labeledFacesRef.current, detection.descriptor);
        const best = rankedCandidates[0];
        const secondBest = rankedCandidates[1];
        const closestScore = Number(Math.max(0, 1 - (best?.distance ?? 1)).toFixed(4));

        if (!best || best.distance > FACE_MATCH_MAX_DISTANCE) {
          pendingFaceMatchRef.current = null;
          setDiagnosticState({
            distanceLabel: faceReadiness.distanceLabel,
            centeringLabel: faceReadiness.centeringLabel,
            livenessLabel: nextLivenessStep === 'verified' ? 'Prova de vida validada' : 'Em validação',
            poseLabel,
            confidence: closestScore,
            lastReason: 'Rosto detectado, mas nenhuma biometria compatível foi encontrada.',
          });
          void logBiometricFailure({
            reason: 'biometric_mismatch',
            score: closestScore,
            metadata: {
              nearestDistance: best ? Number(best.distance.toFixed(4)) : null,
              nearestScore: closestScore,
              maxDistance: FACE_MATCH_MAX_DISTANCE,
              yaw: pose.yaw,
              pitch: pose.pitch,
              poseDirection,
              livenessStep: nextLivenessStep,
              challengeDirection: livenessDirection,
            },
          });
          setFaceGuide(buildFaceGuide(detection, false, 'Rosto detectado, mas a biometria cadastrada não correspondeu. Tente ficar de frente para a câmera.'));
          return;
        }

        const candidateDistanceGap = secondBest ? secondBest.distance - best.distance : Number.POSITIVE_INFINITY;
        if (candidateDistanceGap < MIN_FACE_CANDIDATE_DISTANCE_GAP) {
          pendingFaceMatchRef.current = null;
          setDiagnosticState({
            distanceLabel: faceReadiness.distanceLabel,
            centeringLabel: faceReadiness.centeringLabel,
            livenessLabel: 'Prova de vida validada',
            poseLabel,
            confidence: closestScore,
            lastReason: 'Leitura ambígua entre colaboradores. Nenhuma identidade foi aceita.',
          });
          void logBiometricFailure({
            reason: 'biometric_identity_ambiguous',
            score: closestScore,
            metadata: {
              bestDistance: Number(best.distance.toFixed(4)),
              secondBestDistance: Number(secondBest.distance.toFixed(4)),
              candidateDistanceGap: Number(candidateDistanceGap.toFixed(4)),
              requiredDistanceGap: MIN_FACE_CANDIDATE_DISTANCE_GAP,
              livenessStep: nextLivenessStep,
            },
          });
          setFaceGuide(buildFaceGuide(detection, false, 'Leitura inconclusiva: o rosto ficou parecido com mais de um cadastro. Use o PIN ou reforce a biometria.'));
          return;
        }

        const previousCandidate = pendingFaceMatchRef.current;
        const consistentFrames = previousCandidate?.label === best.label ? previousCandidate.count + 1 : 1;
        pendingFaceMatchRef.current = { label: best.label, count: consistentFrames };
        const requiredConsistentFrames = closestScore >= 0.62 ? REQUIRED_CONSISTENT_FACE_FRAMES : REQUIRED_CONSISTENT_FACE_FRAMES + 1;
        if (consistentFrames < requiredConsistentFrames) {
          setDiagnosticState({
            distanceLabel: faceReadiness.distanceLabel,
            centeringLabel: faceReadiness.centeringLabel,
            livenessLabel: 'Prova de vida validada',
            poseLabel,
            confidence: closestScore,
            lastReason: 'Identidade provável encontrada. Confirmando consistência da leitura.',
          });
          setFaceGuide(buildFaceGuide(detection, false, 'Identidade provável encontrada. Mantenha o rosto parado por um instante.'));
          return;
        }

        const biometricScore = Number(Math.max(0, 1 - best.distance).toFixed(4));
        const biometricThreshold = MIN_BIOMETRIC_SCORE;
        setDiagnosticState({
          distanceLabel: faceReadiness.distanceLabel,
          centeringLabel: faceReadiness.centeringLabel,
          livenessLabel: 'Prova de vida validada',
          poseLabel,
          confidence: biometricScore,
          lastReason: livenessMessage,
        });
        setFaceGuide(
          buildFaceGuide(
            detection,
            true,
            `Rosto mapeado com ${Math.round(biometricScore * 100)}% de confiança.`,
            biometricScore
          )
        );

        const [idRaw, nameRaw] = best.label.split('|');
        const userId = Number(idRaw);
        const name = nameRaw || 'Usuário';
        if (!Number.isFinite(userId)) return;
        const suggestedRecordType = suggestedRecordTypesRef.current.get(userId);
        const recordTypeForMatch = !isRecordTypeManuallySelectedRef.current && suggestedRecordType
          ? suggestedRecordType
          : selectedRecordTypeRef.current;
        if (!isRecordTypeManuallySelectedRef.current && suggestedRecordType) {
          setSelectedRecordType(suggestedRecordType);
        }

        const now = Date.now();
        const last = lastRegisteredRef.current;
        if (last && last.userId === userId && now - last.at < 60_000) {
          setFaceGuide(buildFaceGuide(detection, true, 'Este colaborador já registrou o ponto há menos de um minuto.', biometricScore));
          return;
        }

        lastRegisteredRef.current = { userId, at: now };

        let feedbackDelay = 2500;
        try {
          const response = await recordsApi.registerKiosk({
            userId,
            record_type: recordTypeForMatch,
            method: 'facial',
            device_info: buildDeviceInfo(),
            biometric_score: biometricScore,
            biometric_threshold: biometricThreshold,
            detected_descriptor: Array.from(detection.descriptor),
            latitude: null, // ensure coordinates are captured if possible? no, kiosk doesn't need gps
            longitude: null,
            biometric_context: {
              livenessVerified: nextLivenessStep === 'verified',
              livenessStep: nextLivenessStep,
              poseDirection,
              challengeDirection: livenessDirection,
              yaw: pose.yaw,
              pitch: pose.pitch,
              faceDetected: true,
              scannedAt: new Date().toISOString(),
              source: 'face-api',
              antiConfusionValidated: true,
              consistentFaceFrames: consistentFrames,
              requiredConsistentFaceFrames: requiredConsistentFrames,
              livenessFramesPerStep: REQUIRED_LIVENESS_FRAMES,
              livenessIdentityBound: true,
              candidateCount: rankedCandidates.length,
              candidateDistanceGap: secondBest ? Number(candidateDistanceGap.toFixed(4)) : null,
              requiredCandidateDistanceGap: MIN_FACE_CANDIDATE_DISTANCE_GAP,
            },
          });
          setEmployeeName(response.meta?.userName ?? name);
          const skippedLunchNotice = response.meta?.skippedLunch
            ? ' • Almoço não registrado: período contabilizado no banco de horas.'
            : '';
          setStatusDetail(
            response.meta?.recordType
              ? `Marcação: ${recordTypeLabel(response.meta.recordType)} • Confiança: ${Math.round(biometricScore * 100)}%${skippedLunchNotice}`
              : `Registro concluído • Confiança: ${Math.round(biometricScore * 100)}%${skippedLunchNotice}`
          );
          setStatus('success');
          pendingFaceMatchRef.current = null;
          isRecordTypeManuallySelectedRef.current = false;
          setSelectedRecordType(getTimeBasedSuggestion());
          toast.success(response.message || 'Ponto registrado com sucesso!');
        } catch (error: unknown) {
          console.error('Kiosk facial register error:', error);
          if ((error as ApiError)?.response?.status === 401 || (error as ApiError)?.response?.status === 403) {
            clearKioskToken();
            setKioskToken(null);
            setTerminalEnabled(false);
            matcherRef.current = null;
            setFatalError('Sessão do terminal encerrada. Aguarde nova liberação do administrador.');
          }
          setEmployeeName(name);
          setStatusDetail((error as ApiError)?.response?.data?.error || 'Falha ao registrar via reconhecimento facial.');
          setStatus('error');
          feedbackDelay = 4000;
          if (lastRegisteredRef.current?.userId === userId) lastRegisteredRef.current = null;
          pendingFaceMatchRef.current = null;
          toast.error((error as ApiError)?.response?.data?.error || 'Erro ao registrar ponto.');
        }

        window.setTimeout(() => {
          resetStatus();
          stopRecognition('Leitura finalizada. Clique para iniciar um novo reconhecimento.');
        }, feedbackDelay);
        } finally {
          isProcessingFrameRef.current = false;
        }
      }, SCAN_INTERVAL_MS);
    };

    const onPlay = () => start();
    videoEl.addEventListener('play', onPlay);

    if (!videoEl.paused && videoEl.readyState >= 2) {
      start();
    }

    return () => {
      started = false;
      videoEl.removeEventListener('play', onPlay);
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canScan, status, isRecognitionEnabled, livenessDirection, livenessStep]);

  const handlePinSubmit = async () => {
    if (pinCode.trim().length < 4) {
      toast.error('Informe um PIN válido.');
      return;
    }

    setIsSubmittingPin(true);
    try {
      const response = await recordsApi.registerByPin({
        pinCode: pinCode.trim(),
        record_type: selectedRecordType,
        device_info: buildDeviceInfo(),
      });
      setEmployeeName(response.meta?.userName ?? 'Colaborador identificado');
      setStatusDetail(response.meta?.recordType ? `Marcação: ${recordTypeLabel(response.meta.recordType)}${response.meta.skippedLunch ? ' • Almoço não registrado: período contabilizado no banco de horas.' : ''}` : 'Registro realizado por PIN');
      setStatus('success');
      isRecordTypeManuallySelectedRef.current = false;
      setSelectedRecordType(getTimeBasedSuggestion());
      setShowPinModal(false);
      setPinCode('');
      toast.success(response.message || 'Ponto registrado com sucesso por PIN.');

      window.setTimeout(() => {
        resetStatus();
      }, 2500);
    } catch (error: unknown) {
      console.error('Pin register error:', error);
      setStatus('error');
      setEmployeeName(null);
      setStatusDetail((error as ApiError)?.response?.data?.error || 'Não foi possível registrar por PIN.');
      toast.error((error as ApiError)?.response?.data?.error || 'Não foi possível registrar por PIN.');
    } finally {
      setIsSubmittingPin(false);
    }
  };

  const handleAccessKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessKey.trim()) return;
    setIsSubmittingAccessKey(true);
    try {
      const response = await authApi.kioskLogin(accessKey.trim(), companySlug);
      if (response.success) {
        setKioskToken(getKioskToken());
        setTerminalEnabled(true);
        setCompanyName(response.data.company.name);
        setFatalError(null);
        toast.success('Terminal autenticado com sucesso.');
        if (!companySlug) {
          navigate(`/${response.data.company.slug}/kiosk`, { replace: true });
        }
      }
    } catch (error: unknown) {
      toast.error((error as ApiError)?.response?.data?.error || 'Chave de acesso inválida.');
    } finally {
      setIsSubmittingAccessKey(false);
    }
  };

  const handleResetTerminal = () => {
    resetStatus();
    setFatalError(null);
    lastFailureLogRef.current = null;
    stopRecognition();
    toast.success('Totem reiniciado. A câmera permanece desligada até a próxima leitura.');
  };

  const handleLightAssistToggle = async () => {
    const nextEnabled = !isLightAssistEnabled;
    const track = (videoRef.current?.srcObject as MediaStream | null)?.getVideoTracks()[0];
    if (torchAvailable && track) {
      try {
        await track.applyConstraints({ advanced: [{ torch: nextEnabled }] } as unknown as MediaTrackConstraints);
      } catch (error) {
        console.warn('A lanterna da câmera não pôde ser alterada:', error);
        toast('A lanterna física não está disponível; usando a iluminação da tela.');
      }
    }
    setIsLightAssistEnabled(nextEnabled);
    if (nextEnabled) {
      setIsLowLight(false);
      toast.success(torchAvailable ? 'Iluminação da tela e lanterna ativadas.' : 'Iluminação da tela ativada.');
    }
  };

  const handleRecognitionToggle = async () => {
    if (isRecognitionEnabled) {
      stopRecognition('Reconhecimento pausado. Clique novamente para iniciar.');
      return;
    }

    if (!kioskToken || !terminalEnabled) {
      toast.error('O terminal ainda não está liberado.');
      return;
    }
    if (facesCount === 0) {
      toast.error('Não há biometrias cadastradas para leitura.');
      return;
    }
    if (isStartingRecognitionRef.current) return;

    isStartingRecognitionRef.current = true;
    setIsStartingRecognition(true);
    setFatalError(null);
    try {
      await ensureModelsLoaded();
      await startVideo();
      resetStatus();
      lastFailureLogRef.current = null;
      const challengeDirection = Math.random() >= 0.5 ? 'right' : 'left';
      resetLivenessFlow('Alinhe o rosto ao centro para iniciar a prova de vida.', challengeDirection);
      setFaceGuide({
        detected: false,
        mapped: false,
        message: `Reconhecimento iniciado. Alinhe o rosto ao centro e prepare-se para girar para a ${challengeDirection === 'left' ? 'esquerda' : 'direita'}.`,
      });
      isRecognitionEnabledRef.current = true;
      setIsRecognitionEnabled(true);
    } catch {
      stopVideo();
    } finally {
      isStartingRecognitionRef.current = false;
      setIsStartingRecognition(false);
    }
  };

  const currentLivenessInstruction = !isRecognitionEnabled
    ? 'Clique em iniciar quando o colaborador estiver pronto.'
    : livenessStep === 'turn'
      ? `Gire levemente para a ${livenessDirection === 'left' ? 'esquerda' : 'direita'}.`
      : livenessStep === 'return'
        ? 'Retorne o rosto ao centro.'
        : livenessStep === 'verified'
          ? 'Prova de vida concluída. Validando biometria.'
          : 'Alinhe o rosto ao centro.';

  return (

    <div className={`min-h-dvh px-3 py-3 text-white transition-colors duration-300 sm:px-5 sm:py-5 ${isLightAssistEnabled ? 'bg-white' : 'bg-[#191717]'}`}>
      <div className="mx-auto flex max-w-[90rem] flex-col gap-4">
        <div className={`inline-flex items-center gap-3 self-start rounded-full border px-4 py-1.5 text-sm font-semibold uppercase tracking-[0.2em] text-[#efeeee] ${isLightAssistEnabled ? 'border-[#191717]/20 bg-[#191717] shadow-md' : 'border-white/10 bg-white/5'}`}>
          <Logo dark className="text-xl" />
          <span className="text-white/40">|</span> {companyName ? `${companyName} · Terminal` : 'Terminal'}
        </div>
        <div className="grid items-start gap-4 min-[820px]:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.8fr)] min-[820px]:items-stretch xl:grid-cols-[minmax(0,1.5fr)_minmax(23rem,0.72fr)] xl:gap-5">
          <section className={`relative overflow-hidden rounded-2xl border p-3 shadow-[0_30px_80px_rgba(0,0,0,0.35)] sm:p-4 min-[820px]:sticky min-[820px]:top-3 min-[820px]:flex min-[820px]:h-[calc(100dvh-5.75rem)] min-[820px]:min-h-[42rem] min-[820px]:flex-col ${isLightAssistEnabled ? 'border-white bg-white text-[#191717]' : 'border-white/10 bg-[#151515] text-white'}`}>
            <div className="mb-3 flex shrink-0 items-center justify-between gap-4 border-b border-white/10 pb-3 sm:mb-5 sm:pb-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7fdddd]">
                  Captura ao vivo
                </div>
                <div className="mt-1 text-xl font-semibold tracking-[-0.04em] sm:mt-2 sm:text-2xl">Câmera do terminal</div>
              </div>
              <div className="status-chip border-white/10 bg-[#252525] text-white/80">
                <span className={`h-2.5 w-2.5 rounded-full ${status === 'idle' ? 'bg-[#7fdddd]' : status === 'success' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                {status === 'idle' ? 'Aguardando reconhecimento' : status === 'success' ? 'Registro concluído' : 'Registro não realizado'}
              </div>
            </div>

            <div className={`relative aspect-[4/3] w-full min-h-[18rem] overflow-hidden rounded-xl border bg-[#0f0e0e] sm:aspect-video min-[820px]:min-h-0 min-[820px]:flex-1 min-[820px]:aspect-auto ${isLightAssistEnabled ? 'border-[20px] border-white bg-white sm:border-[28px]' : 'border-white/10'}`}>
              {/* O vídeo muda a cada frame: fundos opacos preservam a leitura dos textos
                  sem o custo contínuo de blur/backdrop em dispositivos mais simples. */}
              <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between border-b border-white/10 bg-black/55 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/65">
                  {isRecognitionEnabled ? 'Reconhecimento ativo' : 'Câmera em espera'}
                </div>
                <div className="text-xs text-white/55">
                  {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}
                </div>
              </div>

              {canScan && isRecognitionEnabled && (
                <div className="absolute inset-x-0 top-14 z-20 flex items-center justify-between px-4">
                  <div className={`inline-flex items-center gap-2 border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                    faceGuide?.mapped
                      ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                      : faceGuide?.detected
                        ? 'border-amber-300/40 bg-amber-400/10 text-amber-100'
                        : 'border-white/10 bg-black/20 text-white/70'
                  }`}>
                    <span className={`h-2.5 w-2.5 rounded-full ${
                      faceGuide?.mapped ? 'bg-emerald-300' : faceGuide?.detected ? 'bg-amber-300' : 'bg-white/40'
                    }`} />
                    {faceGuide?.mapped ? 'Mapeamento ativo' : faceGuide?.detected ? 'Rosto detectado' : 'Aguardando rosto'}
                  </div>
                  {faceGuide?.confidence != null && (
                    <div className="border border-white/10 bg-black/55 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">
                      Confiança {Math.round(faceGuide.confidence * 100)}%
                    </div>
                  )}
                </div>
              )}

              {canScan && isRecognitionEnabled && (
                <div className="absolute inset-x-0 top-28 z-20 px-4">
                  <div className="inline-flex max-w-full items-center gap-2 border border-[#7fdddd]/25 bg-black/55 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#dff9f9]">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {currentLivenessInstruction}
                  </div>
                </div>
              )}

              {isLowLight && !isLightAssistEnabled && isRecognitionEnabled && (
                <div className="absolute inset-x-0 top-40 z-20 px-4">
                  <button onClick={() => void handleLightAssistToggle()} className="inline-flex max-w-full items-center gap-2 border border-amber-200/60 bg-amber-300 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2d2310] shadow-lg animate-pulse">
                    <Zap className="h-4 w-4 shrink-0" /> Ambiente escuro detectado — ativar iluminação
                  </button>
                </div>
              )}

              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <div className="h-[21rem] w-[21rem] rounded-full border border-dashed border-white/35 sm:h-[25rem] sm:w-[25rem]" />
              </div>

              <div className="absolute inset-x-[18%] top-[11%] z-10 h-[78%] border border-[#7fdddd]/40" />

              {faceGuide?.box && canScan && isRecognitionEnabled && (
                <div
                  className={`absolute z-20 border-2 transition-all duration-150 ${
                    faceGuide.mapped ? 'border-emerald-300 shadow-[0_0_0_9999px_rgba(2,102,102,0.08)]' : 'border-amber-300'
                  }`}
                  style={{
                    top: `${faceGuide.box.top}%`,
                    left: `${faceGuide.box.left}%`,
                    width: `${faceGuide.box.width}%`,
                    height: `${faceGuide.box.height}%`,
                  }}
                >
                  <div className={`absolute -top-8 left-0 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                    faceGuide.mapped ? 'bg-emerald-300 text-[#0f1e1e]' : 'bg-amber-300 text-[#2d2310]'
                  }`}>
                    {faceGuide.mapped ? 'Rosto mapeado' : 'Validando rosto'}
                  </div>
                </div>
              )}

              {!isModelLoaded ? (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#111010]">
                  <div className="h-14 w-14 animate-spin rounded-full border-4 border-white/10 border-t-[#026666]" />
                  <p className="mt-5 text-sm text-white/72">Carregando motor de reconhecimento...</p>
                </div>
              ) : fatalError ? (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#111010] px-6 text-center">
                  <p className="text-lg font-semibold text-[#efeeee]">Reconhecimento indisponivel</p>
                  <p className="mt-3 max-w-md text-sm leading-6 text-white/68">{fatalError}</p>
                </div>
              ) : !kioskToken ? (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#111010] px-6 text-center">
                  <KeyRound className="mb-4 h-12 w-12 text-[#7fdddd]" />
                  <p className="text-lg font-semibold text-[#efeeee]">Autenticação do Terminal</p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-white/68">
                    {companyLookupError
                      ? companyLookupError
                      : `Insira a chave de acesso${companyName ? ` de ${companyName}` : ''} para vincular este dispositivo como um Totem de ponto.`}
                  </p>
                  <form onSubmit={handleAccessKeySubmit} className="mt-6 flex w-full max-w-sm flex-col gap-3">
                    <input
                      type="password"
                      className="border border-white/10 bg-black/40 px-4 py-3 text-center text-lg text-white placeholder-white/30 focus:border-[#7fdddd] focus:outline-none"
                      placeholder="Chave de acesso"
                      value={accessKey}
                      onChange={(e) => setAccessKey(e.target.value)}
                    />
                    <button
                      type="submit"
                      disabled={isSubmittingAccessKey || !accessKey.trim() || Boolean(companyLookupError)}
                      className="bg-[#026666] px-4 py-3 font-semibold text-white transition-colors hover:bg-[#014f4f] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSubmittingAccessKey ? 'Autenticando...' : 'Autenticar Terminal'}
                    </button>
                  </form>
                </div>
              ) : isFacesLoading ? (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#111010] px-6 text-center">
                  <div className="h-14 w-14 animate-spin rounded-full border-4 border-white/10 border-t-[#026666]" />
                  <p className="mt-5 text-sm text-white/72">Carregando biometrias do terminal...</p>
                </div>
              ) : facesCount === 0 ? (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#111010] px-6 text-center">
                  <p className="text-lg font-semibold text-[#efeeee]">Nenhuma biometria cadastrada</p>
                  <p className="mt-3 max-w-md text-sm leading-6 text-white/68">
                    Cadastre a face do colaborador no painel de equipe para liberar o uso do totem.
                  </p>
                </div>
              ) : isStartingRecognition ? (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#111010] px-6 text-center">
                  <div className="h-14 w-14 animate-spin rounded-full border-4 border-white/10 border-t-[#026666]" />
                  <p className="mt-5 text-sm text-white/72">Inicializando câmera e motor facial...</p>
                </div>
              ) : !isCameraReady ? (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#111010] px-6 text-center">
                  <Camera className="mb-4 h-12 w-12 text-[#7fdddd]" />
                  <p className="text-lg font-semibold text-[#efeeee]">Câmera desligada</p>
                  <p className="mt-3 max-w-md text-sm leading-6 text-white/68">A câmera será ligada somente durante o reconhecimento e desligada assim que a leitura terminar.</p>
                  <button
                    type="button"
                    onClick={() => void handleRecognitionToggle()}
                    className="mt-6 inline-flex items-center gap-3 border border-[#7fdddd]/40 bg-[#026666] px-6 py-4 text-sm font-semibold text-white transition-colors hover:bg-[#014f4f]"
                  >
                    <Camera className="h-5 w-5" /> Iniciar reconhecimento facial
                  </button>
                </div>
              ) : null}

              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={`object-cover scale-x-[-1] transition-all duration-300 ${
                  isLightAssistEnabled
                    ? 'absolute left-1/2 top-1/2 z-0 h-[21rem] w-[21rem] -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white ring-8 ring-white/90 sm:h-[25rem] sm:w-[25rem]'
                    : 'h-full w-full'
                } ${
                  isRecognitionEnabled ? 'opacity-100 blur-0' : 'opacity-45 blur-[2px] saturate-50'
                }`}
              />

              {canScan && !isRecognitionEnabled && !fatalError && kioskToken && isCameraReady && facesCount > 0 && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
                  <div className="flex max-w-md flex-col items-center px-6 text-center">
                    <button
                      onClick={() => void handleRecognitionToggle()}
                      className="inline-flex items-center gap-3 border border-[#7fdddd]/40 bg-[#026666]/70 px-6 py-4 text-sm font-semibold text-white transition-colors hover:bg-[#026666]"
                    >
                      <Camera className="h-5 w-5" />
                      Iniciar reconhecimento facial
                    </button>
                    <p className="mt-4 text-sm leading-6 text-white/72">
                      A câmera permanece desligada fora da leitura. Inicie somente quando o colaborador estiver posicionado e pronto para seguir o desafio exibido na tela.
                    </p>
                  </div>
                </div>
              )}

              {canScan && faceGuide?.message && status === 'idle' && (
                <div className="absolute inset-x-0 bottom-0 z-20 border-t border-white/10 bg-black/55 px-4 py-3">
                  <div className="text-sm text-white/80">{faceGuide.message}</div>
                </div>
              )}

              {canScan && status === 'idle' && (
                <div className={`absolute inset-x-3 z-20 flex flex-wrap items-center justify-center gap-1.5 transition-all sm:inset-x-4 sm:gap-2 ${faceGuide?.message ? 'bottom-16' : 'bottom-3'}`}>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/65 px-3 py-1.5 text-[10px] text-white shadow-lg backdrop-blur-sm sm:text-xs">
                    <span className="text-white/55">Posição</span><strong>{diagnosticState.poseLabel}</strong>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/65 px-3 py-1.5 text-[10px] text-white shadow-lg backdrop-blur-sm sm:text-xs">
                    <span className="text-white/55">Distância</span><strong>{diagnosticState.distanceLabel}</strong>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/65 px-3 py-1.5 text-[10px] text-white shadow-lg backdrop-blur-sm sm:text-xs">
                    <span className="text-white/55">Enquadramento</span><strong>{diagnosticState.centeringLabel}</strong>
                  </div>
                </div>
              )}

              {status === 'success' && (
                <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#026666]/30 backdrop-blur-sm">
                  <CheckCircle className="mb-4 h-28 w-28 text-emerald-300" />
                  <h2 className="text-3xl font-semibold tracking-[-0.04em] text-white">Registro confirmado</h2>
                  <p className="mt-2 text-lg text-[#dff9f9]">{employeeName}</p>
                  <p className="mt-2 text-sm uppercase tracking-[0.18em] text-white/70">
                    {statusDetail}
                  </p>
                </div>
              )}

              {status === 'error' && (
                <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#b43737]/25 px-6 text-center backdrop-blur-sm">
                  <XCircle className="mb-4 h-28 w-28 text-red-300" />
                  <h2 className="text-3xl font-semibold tracking-[-0.04em] text-white">Ponto não registrado</h2>
                  <p className="mt-2 text-lg text-red-100">{employeeName ? `Colaborador identificado: ${employeeName}` : 'Nenhuma marcação foi gravada'}</p>
                  {statusDetail && <p className="mt-3 max-w-lg text-sm leading-6 text-red-100/90">{statusDetail}</p>}
                </div>
              )}
            </div>
          </section>

          <aside className="flex min-w-0 flex-col gap-3">
            <section className="order-3 rounded-2xl border border-white/10 bg-[#151515] p-4 shadow-lg">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7fdddd]">Orientacoes operacionais</div>
              <ul className="mt-3 grid gap-2 text-xs leading-5 text-white/72 sm:grid-cols-2 lg:grid-cols-1">
                <li>Posicione o rosto centralizado dentro da area de captura.</li>
                <li>Conclua a prova de vida olhando ao centro, seguindo a direcao solicitada na tela e retornando ao centro.</li>
                <li>Evite contraluz, bone, mascara ou oclusao parcial do rosto.</li>
                <li>Use PIN apenas como contingencia quando a biometria nao estiver disponivel.</li>
              </ul>
            </section>

            <section className="order-1 rounded-2xl border border-[#7fdddd]/20 bg-[#151515] p-4 shadow-lg">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7fdddd]">Tipo de marcação</div>
              <p className="mt-3 text-sm leading-6 text-white/72">Sugestão atual: <span className="font-semibold text-[#dff9f9]">{RECORD_TYPE_OPTIONS.find((option) => option.value === selectedRecordType)?.label}</span>. Ela usa o horário e, após identificar o colaborador, as batidas feitas hoje.</p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
                {RECORD_TYPE_OPTIONS.map((option, index) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={isRecognitionEnabled || isSubmittingPin}
                    onClick={() => {
                      isRecordTypeManuallySelectedRef.current = true;
                      selectedRecordTypeRef.current = option.value;
                      setSelectedRecordType(option.value);
                    }}
                    className={`flex min-h-14 items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                      selectedRecordType === option.value
                        ? 'border-[#7fdddd] bg-[#026666] text-white shadow-[0_8px_24px_rgba(2,102,102,0.28)]'
                        : 'border-white/10 bg-white/[0.04] text-white/75 hover:border-white/20 hover:bg-white/10'
                    }`}
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] ${selectedRecordType === option.value ? 'bg-white/15' : 'bg-white/10 text-white/55'}`}>{index + 1}</span>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
              {selectedRecordType === 'exit' && (
                <div className="mt-3 rounded-xl border border-amber-300/40 bg-amber-300/10 px-3 py-2.5 text-xs leading-5 text-amber-100">
                  Saída direta selecionada: se não houver batidas de almoço hoje, o período de almoço será considerado como tempo trabalhado e irá para o banco de horas.
                </div>
              )}
            </section>

            <div className="order-2 grid gap-2 rounded-2xl border border-white/10 bg-[#151515] p-3 text-white sm:grid-cols-2">
              <button
                onClick={() => void handleRecognitionToggle()}
                disabled={!kioskToken || !terminalEnabled || isFacesLoading || facesCount === 0 || isStartingRecognition}
                className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  isRecognitionEnabled
                    ? 'border-amber-300/40 bg-amber-400/10 hover:bg-amber-400/20'
                    : 'border-[#026666] bg-[#026666] hover:bg-[#014f4f]'
                }`}
              >
                <Camera className="h-5 w-5" />
                {isStartingRecognition ? 'Inicializando...' : isRecognitionEnabled ? 'Parar reconhecimento' : 'Iniciar reconhecimento'}
              </button>
              <button
                onClick={handleResetTerminal}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                <RefreshCw className="h-5 w-5 text-[#7fdddd]" />
                Reiniciar captura
              </button>
              <button
                onClick={() => void handleLightAssistToggle()}
                disabled={!isCameraReady}
                className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  isLightAssistEnabled
                    ? 'border-amber-200 bg-amber-300 text-[#2d2310] hover:bg-amber-200'
                    : isLowLight
                      ? 'border-amber-300 bg-amber-300 text-[#2d2310] hover:bg-amber-200 animate-pulse'
                      : 'border-white/10 bg-white/5 text-white hover:bg-white/10'
                }`}
              >
                {isLightAssistEnabled ? <Sun className="h-5 w-5" /> : <Zap className="h-5 w-5" />}
                {isLightAssistEnabled ? 'Desativar iluminação' : torchAvailable ? 'Ativar flash e tela' : 'Ativar iluminação'}
              </button>
              <button
                onClick={() => setShowPinModal(true)}
                disabled={!kioskToken}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#026666] bg-[#026666] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#014f4f] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <KeyRound className="h-5 w-5" />
                Usar PIN de acesso
              </button>
            </div>

            <section className="order-4 rounded-2xl border border-white/10 bg-[#151515] p-4 shadow-lg">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7fdddd]">Diagnostico biometrico</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="col-span-2 flex items-center justify-between rounded-xl border border-white/10 bg-black/15 px-3 py-2.5">
                  <span className="text-sm text-white/72">Prova de vida</span>
                  <span className="font-semibold text-[#efeeee]">{diagnosticState.livenessLabel}</span>
                </div>
                <div className="flex flex-col rounded-xl border border-white/10 bg-black/15 px-3 py-2.5">
                  <span className="text-sm text-white/72">Pose atual</span>
                  <span className="font-semibold text-[#efeeee]">{diagnosticState.poseLabel}</span>
                </div>
                <div className="flex flex-col rounded-xl border border-white/10 bg-black/15 px-3 py-2.5">
                  <span className="text-sm text-white/72">Distância</span>
                  <span className="font-semibold text-[#efeeee]">{diagnosticState.distanceLabel}</span>
                </div>
                <div className="flex flex-col rounded-xl border border-white/10 bg-black/15 px-3 py-2.5">
                  <span className="text-sm text-white/72">Centralização</span>
                  <span className="font-semibold text-[#efeeee]">{diagnosticState.centeringLabel}</span>
                </div>
                <div className="flex flex-col rounded-xl border border-white/10 bg-black/15 px-3 py-2.5">
                  <span className="text-sm text-white/72">Confiança</span>
                  <span className="font-semibold text-[#efeeee]">
                    {diagnosticState.confidence != null ? `${Math.round(diagnosticState.confidence * 100)}%` : '—'}
                  </span>
                </div>
              </div>
              <div className="mt-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2.5 text-xs leading-5 text-white/72">
                {diagnosticState.lastReason}
              </div>
            </section>

            <section className="order-5 rounded-2xl border border-white/10 bg-[#151515] p-4 shadow-lg">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7fdddd]">ACESSO DO TERMINAL</div>
              {kioskToken ? (
                <div className="mt-5 space-y-4">
                  <div className="flex items-center gap-3 border border-white/10 bg-black/15 px-4 py-4">
                    <ShieldCheck className="h-5 w-5 text-[#7fdddd]" />
                    <div>
                      <div className="text-sm font-semibold text-[#efeeee]">Terminal autenticado</div>
                      <div className="text-xs text-white/60">O kiosk pode consumir biometria e registrar marcações.</div>
                      <div className="mt-2 text-[11px] uppercase tracking-[0.16em] text-[#7fdddd]">
                        Encerramento somente pelo administrador no painel
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  <div className="flex items-center gap-3 border border-white/10 bg-black/15 px-4 py-4">
                    <ShieldCheck className="h-5 w-5 text-[#7fdddd]" />
                    <div>
                      <div className="text-sm font-semibold text-[#efeeee]">Terminal bloqueado</div>
                      <div className="text-xs text-white/60">
                        A liberação do totem é feita exclusivamente por administrador em Configurações.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>

      {showPinModal && (
        <div className="modal-shell">
          <div className="modal-card max-w-md p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#026666]">Contingencia</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#191717]">Registro por PIN</h2>
            <p className="mt-3 text-sm leading-7 text-[#6e6a6a]">
              Use o PIN apenas quando a biometria facial não puder ser concluída.
            </p>
            <div className="mt-5 space-y-4">
              <input
                type="text"
                name="kiosk-verification"
                inputMode="numeric"
                autoComplete="off"
                aria-autocomplete="none"
                pattern="[0-9]*"
                maxLength={10}
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                className="field-input [-webkit-text-security:disc]"
                placeholder="Informe o código PIN do colaborador"
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
              />
              <div className="flex gap-3">
                <button onClick={() => { setShowPinModal(false); setPinCode(''); }} className="btn-secondary flex-1">
                  Cancelar
                </button>
                <button onClick={handlePinSubmit} disabled={isSubmittingPin} className="btn-primary flex-1">
                  {isSubmittingPin ? 'Validando...' : 'Registrar por PIN'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
