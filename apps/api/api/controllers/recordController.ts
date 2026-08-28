import { Op } from 'sequelize';
import { Response } from 'express';
import fs from 'fs/promises';
import { TimeRecord } from '../models/TimeRecord.js';
import { BiometricEvent } from '../models/BiometricEvent.js';
import { BiometricSample } from '../models/BiometricSample.js';
import { User } from '../models/User.js';
import { AuthRequest } from '../middlewares/authMiddleware.js';
import bcrypt from 'bcrypt';
import { assertPeriodOpen } from '../utils/monthlyClosing.js';
import { AttendanceService } from '../services/AttendanceService.js';
import { AuditService } from '../services/AuditService.js';
import { getManagedUserIds, isManagerResponsibleForUser } from '../utils/leadership.js';

import { calculateDistance } from '../utils/geo.js';
import { CompanyProfile } from '../models/CompanyProfile.js';
import { EmailDeliveryFailure } from '../models/EmailDeliveryFailure.js';
import { EmailDeliveryLog } from '../models/EmailDeliveryLog.js';
import { attemptTimeRecordEmail } from '../services/TimeRecordEmailService.js';
import { RemotePhotoEvidence } from '../models/RemotePhotoEvidence.js';

const AUTOMATIC_SEQUENCE: Array<'entry' | 'lunch_start' | 'lunch_end' | 'exit'> = [
  'entry',
  'lunch_start',
  'lunch_end',
  'exit',
];

const RECORD_TYPE_LABELS: Record<'entry' | 'lunch_start' | 'lunch_end' | 'exit', string> = {
  entry: 'entrada',
  lunch_start: 'saída para almoço',
  lunch_end: 'retorno do almoço',
  exit: 'saída da empresa',
};
const SERVER_MIN_FACE_MATCH_THRESHOLD = 0.5;
const SERVER_MAX_FACE_MATCH_THRESHOLD = 0.8;
const SERVER_MAX_FACE_DISTANCE = 0.48;
const SERVER_MIN_CANDIDATE_GAP = 0.06;

class BiometricValidationError extends Error {
  readonly statusCode = 422;
}

const parseFaceDescriptor = (value: unknown): number[] | null => {
  if (!Array.isArray(value) || value.length !== 128) return null;
  const descriptor = value.map(Number);
  return descriptor.every((item) => Number.isFinite(item) && Math.abs(item) <= 10) ? descriptor : null;
};

const faceDistance = (left: number[], right: number[]) => Math.sqrt(
  left.reduce((sum, value, index) => sum + ((value - right[index]) ** 2), 0)
);
const PIN_MAX_FAILED_ATTEMPTS = 5;
const PIN_LOCK_WINDOW_MS = 5 * 60 * 1000;
const pinAttemptMap = new Map<string, { failedAttempts: number; lockedUntil: number | null; lastFailureAt: number }>();

const getDayBounds = (date = new Date()) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  return { start, end };
};

const getClientIp = (req: AuthRequest) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || null;
};

const buildPinAttemptKey = (req: AuthRequest, deviceInfo?: string | null) => {
  const ip = getClientIp(req) || 'unknown-ip';
  const deviceSuffix = typeof deviceInfo === 'string' && deviceInfo.trim() ? deviceInfo.trim().slice(0, 120) : 'unknown-device';
  return `${ip}::${deviceSuffix}`;
};

const getPinAttemptState = (attemptKey: string) => {
  const now = Date.now();
  const current = pinAttemptMap.get(attemptKey);
  if (!current) return { failedAttempts: 0, lockedUntil: null, lastFailureAt: 0 };
  if (current.lockedUntil && current.lockedUntil <= now && now - current.lastFailureAt > PIN_LOCK_WINDOW_MS) {
    pinAttemptMap.delete(attemptKey);
    return { failedAttempts: 0, lockedUntil: null, lastFailureAt: 0 };
  }
  return current;
};

const registerPinFailure = (attemptKey: string) => {
  const now = Date.now();
  const current = getPinAttemptState(attemptKey);
  const withinWindow = now - current.lastFailureAt < PIN_LOCK_WINDOW_MS;
  const failedAttempts = withinWindow ? current.failedAttempts + 1 : 1;
  const lockedUntil = failedAttempts >= PIN_MAX_FAILED_ATTEMPTS ? now + PIN_LOCK_WINDOW_MS : null;
  const nextState = { failedAttempts, lockedUntil, lastFailureAt: now };
  pinAttemptMap.set(attemptKey, nextState);
  return nextState;
};

const clearPinAttemptState = (attemptKey: string) => {
  pinAttemptMap.delete(attemptKey);
};

const logBiometricEvent = async (payload: {
  userId?: number | null;
  eventType: 'verification_success' | 'verification_failure' | 'pin_fallback';
  method: 'facial' | 'pin';
  deviceInfo?: string | null;
  matchScore?: number | null;
  threshold?: number | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  success?: boolean;
}) => {
  try {
    await BiometricEvent.create({
      user_id: payload.userId ?? null,
      event_type: payload.eventType,
      method: payload.method,
      success: payload.success ?? payload.eventType !== 'verification_failure',
      match_score: payload.matchScore ?? null,
      threshold: payload.threshold ?? null,
      reason: payload.reason ?? null,
      device_info: payload.deviceInfo ?? null,
      metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
    });
  } catch (error) {
    console.error('Biometric operation log error:', error);
  }
};

const validateKioskFacialAttempt = async ({
  user,
  biometricScore,
  biometricThreshold,
  detectedDescriptor,
  deviceInfo,
  context,
}: {
  user: User;
  biometricScore: unknown;
  biometricThreshold: unknown;
  detectedDescriptor: unknown;
  deviceInfo?: string | null;
  context?: Record<string, unknown> | null;
}) => {
  const parsedScore = typeof biometricScore === 'number' && Number.isFinite(biometricScore) ? biometricScore : null;
  const parsedThreshold = typeof biometricThreshold === 'number' && Number.isFinite(biometricThreshold) ? biometricThreshold : null;
  const livenessVerified = Boolean(context?.livenessVerified);
  const challengeDirection = context?.challengeDirection;
  const parsedDescriptor = parseFaceDescriptor(detectedDescriptor);
  const safeguardsValid = context?.antiConfusionValidated === true
    && context?.livenessIdentityBound === true
    && Number(context?.consistentFaceFrames) >= 2
    && Number(context?.livenessFramesPerStep) >= 2;

  if (!user.facial_descriptor) {
    await logBiometricEvent({
      userId: user.id,
      eventType: 'verification_failure',
      method: 'facial',
      deviceInfo,
      reason: 'biometric_not_enrolled',
      metadata: {
        validation: 'server',
      },
      success: false,
    });
    throw new BiometricValidationError('O colaborador não possui biometria facial ativa para uso no totem.');
  }

  if (parsedScore === null || parsedThreshold === null) {
    await logBiometricEvent({
      userId: user.id,
      eventType: 'verification_failure',
      method: 'facial',
      deviceInfo,
      reason: 'biometric_score_missing',
      metadata: {
        validation: 'server',
      },
      success: false,
    });
    throw new BiometricValidationError('A tentativa biométrica chegou sem score válido para validação segura.');
  }

  if (parsedThreshold < SERVER_MIN_FACE_MATCH_THRESHOLD || parsedThreshold > SERVER_MAX_FACE_MATCH_THRESHOLD) {
    await logBiometricEvent({
      userId: user.id,
      eventType: 'verification_failure',
      method: 'facial',
      deviceInfo,
      matchScore: parsedScore,
      threshold: parsedThreshold,
      reason: 'biometric_threshold_invalid',
      metadata: {
        validation: 'server',
      },
      success: false,
    });
    throw new BiometricValidationError('O limiar biométrico informado pelo terminal é inválido.');
  }

  if (!livenessVerified) {
    await logBiometricEvent({
      userId: user.id,
      eventType: 'verification_failure',
      method: 'facial',
      deviceInfo,
      matchScore: parsedScore,
      threshold: parsedThreshold,
      reason: 'liveness_not_verified',
      metadata: {
        validation: 'server',
        context,
      },
      success: false,
    });
    throw new BiometricValidationError('A prova de vida não foi validada pelo terminal.');
  }

  if (challengeDirection !== 'left' && challengeDirection !== 'right') {
    await logBiometricEvent({
      userId: user.id,
      eventType: 'verification_failure',
      method: 'facial',
      deviceInfo,
      matchScore: parsedScore,
      threshold: parsedThreshold,
      reason: 'liveness_challenge_missing',
      metadata: {
        validation: 'server',
        context,
      },
      success: false,
    });
    throw new BiometricValidationError('O terminal não informou um desafio biométrico válido.');
  }

  if (!safeguardsValid) {
    await logBiometricEvent({
      userId: user.id, eventType: 'verification_failure', method: 'facial', deviceInfo,
      matchScore: parsedScore, threshold: parsedThreshold, reason: 'biometric_safeguards_missing',
      metadata: { validation: 'server', context }, success: false,
    });
    throw new BiometricValidationError('O terminal não comprovou todas as etapas de segurança da leitura facial.');
  }

  if (parsedScore < parsedThreshold) {
    await logBiometricEvent({
      userId: user.id,
      eventType: 'verification_failure',
      method: 'facial',
      deviceInfo,
      matchScore: parsedScore,
      threshold: parsedThreshold,
      reason: 'biometric_score_below_threshold',
      metadata: {
        validation: 'server',
        context,
      },
      success: false,
    });
    throw new BiometricValidationError('A confiança da biometria ficou abaixo do mínimo aceito pelo servidor.');
  }

  if (!parsedDescriptor) {
    await logBiometricEvent({
      userId: user.id, eventType: 'verification_failure', method: 'facial', deviceInfo,
      matchScore: parsedScore, threshold: parsedThreshold, reason: 'biometric_descriptor_invalid',
      metadata: { validation: 'server' }, success: false,
    });
    throw new BiometricValidationError('A leitura facial chegou sem um descritor biométrico válido.');
  }

  const enrolledUsers = await User.findAll({
    where: { status: 'active', facial_descriptor: { [Op.ne]: null }, requires_time_tracking: true },
    attributes: ['id', 'facial_descriptor'],
  });
  const userIds = enrolledUsers.map((candidate) => candidate.id);
  const samples = userIds.length ? await BiometricSample.findAll({
    where: { user_id: { [Op.in]: userIds } }, attributes: ['user_id', 'descriptor'], raw: true,
  }) as unknown as Array<{ user_id: number; descriptor: string }> : [];
  const descriptorsByUser = new Map<number, number[][]>();

  for (const enrolledUser of enrolledUsers) {
    try {
      const descriptor = parseFaceDescriptor(JSON.parse(enrolledUser.facial_descriptor || 'null'));
      if (descriptor) descriptorsByUser.set(enrolledUser.id, [descriptor]);
    } catch { /* cadastro inválido é ignorado e pode ser refeito pelo administrador */ }
  }
  for (const sample of samples) {
    try {
      const descriptor = parseFaceDescriptor(JSON.parse(sample.descriptor));
      if (descriptor) descriptorsByUser.set(sample.user_id, [...(descriptorsByUser.get(sample.user_id) ?? []), descriptor]);
    } catch { /* amostra inválida não participa da comparação */ }
  }

  const rankedCandidates = [...descriptorsByUser.entries()]
    .map(([candidateUserId, descriptors]) => ({
      userId: candidateUserId,
      distance: Math.min(...descriptors.map((descriptor) => faceDistance(parsedDescriptor, descriptor))),
    }))
    .sort((left, right) => left.distance - right.distance);
  const bestCandidate = rankedCandidates[0];
  const secondCandidate = rankedCandidates[1];
  const candidateGap = secondCandidate ? secondCandidate.distance - bestCandidate.distance : Number.POSITIVE_INFINITY;
  const serverScore = bestCandidate ? Number(Math.max(0, 1 - bestCandidate.distance).toFixed(4)) : 0;

  if (!bestCandidate || bestCandidate.userId !== user.id || bestCandidate.distance > SERVER_MAX_FACE_DISTANCE) {
    await logBiometricEvent({
      userId: user.id, eventType: 'verification_failure', method: 'facial', deviceInfo,
      matchScore: serverScore, threshold: parsedThreshold, reason: 'biometric_server_identity_mismatch',
      metadata: { validation: 'server', nearestUserId: bestCandidate?.userId ?? null, nearestDistance: bestCandidate?.distance ?? null }, success: false,
    });
    throw new BiometricValidationError('O servidor não confirmou que a leitura pertence ao colaborador informado.');
  }

  if (candidateGap < SERVER_MIN_CANDIDATE_GAP) {
    await logBiometricEvent({
      userId: user.id, eventType: 'verification_failure', method: 'facial', deviceInfo,
      matchScore: serverScore, threshold: parsedThreshold, reason: 'biometric_server_identity_ambiguous',
      metadata: { validation: 'server', candidateGap, requiredGap: SERVER_MIN_CANDIDATE_GAP }, success: false,
    });
    throw new BiometricValidationError('A leitura ficou parecida com mais de um cadastro. Use o PIN ou refaça a biometria.');
  }

  if (Math.abs(serverScore - parsedScore) > 0.03) {
    throw new BiometricValidationError('A conferência biométrica do servidor divergiu da leitura do terminal.');
  }
};

export const logBiometricFailure = async (req: AuthRequest, res: Response) => {
  try {
    const requester = req.user;
    if (!requester || requester.role !== 'kiosk') {
      return res.status(403).json({ success: false, error: 'Acesso restrito ao terminal autenticado.' });
    }

    const {
      userId,
      reason,
      biometric_score,
      biometric_threshold,
      device_info,
      metadata,
    } = req.body as {
      userId?: number | null;
      reason?: string;
      biometric_score?: number | null;
      biometric_threshold?: number | null;
      device_info?: string | null;
      metadata?: Record<string, unknown>;
    };

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'Motivo da falha biométrica não informado.' });
    }

    await logBiometricEvent({
      userId: typeof userId === 'number' ? userId : null,
      eventType: 'verification_failure',
      method: 'facial',
      deviceInfo: device_info,
      matchScore: typeof biometric_score === 'number' ? biometric_score : null,
      threshold: typeof biometric_threshold === 'number' ? biometric_threshold : null,
      reason: reason.trim(),
      metadata: metadata ?? {},
      success: false,
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('Biometric failure log error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao registrar a falha biométrica.' });
  }
};

const normalizeManualType = (
  requestedType: unknown,
  existingRecords: TimeRecord[]
): 'entry' | 'lunch_start' | 'lunch_end' | 'exit' => {
  const existingTypes = new Set(existingRecords.map((record) => record.record_type));
  const expectedType = AUTOMATIC_SEQUENCE.find((type) => !existingTypes.has(type));

  if (existingTypes.has('exit')) {
    throw new Error('A jornada de hoje já foi encerrada com a saída da empresa.');
  }

  if (!requestedType || requestedType === 'auto') {
    if (!expectedType) {
      throw new Error('A jornada de hoje já possui as 4 marcações padrão.');
    }
    return expectedType;
  }

  if (!AUTOMATIC_SEQUENCE.includes(requestedType as 'entry')) {
    throw new Error('Tipo de registro inválido.');
  }

  if (existingTypes.has(requestedType as 'entry' | 'lunch_start' | 'lunch_end' | 'exit')) {
    throw new Error(`A marcação de ${RECORD_TYPE_LABELS[requestedType as keyof typeof RECORD_TYPE_LABELS]} já foi registrada hoje.`);
  }

  // A direct exit after entry is valid: the employee worked through the
  // scheduled lunch and receives those minutes in the time bank.
  const isDirectExitAfterEntry = expectedType === 'lunch_start' && requestedType === 'exit';
  if (expectedType && requestedType !== expectedType && !isDirectExitAfterEntry) {
    throw new Error(`A próxima marcação válida para hoje é "${RECORD_TYPE_LABELS[expectedType]}".`);
  }

  return requestedType as 'entry' | 'lunch_start' | 'lunch_end' | 'exit';
};

const verifyPin = async (inputPin: string, storedPin: string | null) => {
  if (!storedPin) return false;
  if (storedPin.startsWith('$2')) {
    return bcrypt.compare(inputPin, storedPin);
  }
  return inputPin === storedPin;
};

const parseAdjustedTime = (value: unknown, baseDate: Date) => {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) {
    throw new Error('Horário ajustado inválido. Use o formato HH:MM.');
  }

  const [hours, minutes] = value.split(':').map(Number);
  if (hours > 23 || minutes > 59) {
    throw new Error('Horário ajustado inválido.');
  }

  return new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    hours,
    minutes,
    0,
    0
  );
};

const buildGoogleMapsUrl = (latitude?: unknown, longitude?: unknown) => {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
    return null;
  }

  const parsedLatitude = typeof latitude === 'number' ? latitude : Number(latitude);
  const parsedLongitude = typeof longitude === 'number' ? longitude : Number(longitude);
  if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) {
    return null;
  }

  return `https://www.google.com/maps/search/?api=1&query=${parsedLatitude},${parsedLongitude}`;
};

const serializeRecordWithGeoLinks = <T extends TimeRecord>(record: T) => {
  const payload = record.toJSON() as T & Record<string, unknown>;
  return {
    ...payload,
    map_url: buildGoogleMapsUrl(payload.latitude, payload.longitude),
  };
};

const createValidatedRecord = async ({
  user,
  requestedType,
  method,
  latitude,
  longitude,
  ipAddress,
  deviceInfo,
  gpsAccuracy,
  trustLevel,
}: {
  user: User;
  requestedType?: unknown;
  method: 'facial' | 'pin' | 'manual' | 'web';
  latitude?: number | null;
  longitude?: number | null;
  ipAddress: string | null;
  deviceInfo?: string | null;
  gpsAccuracy?: number | null;
  trustLevel?: 'high' | 'medium' | 'low';
}) => {
  if (user.status !== 'active') {
    throw new Error('Usuário inativo não pode registrar ponto.');
  }

  if (!user.requires_time_tracking) {
    throw new Error('Este usuário não está sujeito ao controle de ponto.');
  }

  const now = new Date();
  await assertPeriodOpen(now, 'registrar novos pontos');
  const { start, end } = getDayBounds(now);
  const existingRecords = await TimeRecord.findAll({
    where: {
      user_id: user.id,
      status: { [Op.ne]: 'rejected' },
      record_time: { [Op.between]: [start, end] },
    },
    order: [['record_time', 'ASC']],
  });

  const lastRecord = existingRecords[existingRecords.length - 1];
  if (lastRecord) {
    const diffMs = now.getTime() - new Date(lastRecord.record_time).getTime();
    if (diffMs < 60_000) {
      throw new Error('Já existe uma marcação recente para este colaborador. Aguarde 1 minuto para tentar novamente.');
    }
  }

  const resolvedType = normalizeManualType(requestedType, existingRecords);
  const skippedLunch =
    resolvedType === 'exit' &&
    existingRecords.some((item) => item.record_type === 'entry') &&
    !existingRecords.some((item) => item.record_type === 'lunch_start' || item.record_type === 'lunch_end');
  const record = await TimeRecord.create({
    user_id: user.id,
    record_time: now,
    record_type: resolvedType,
    method,
    latitude: latitude ?? null,
    longitude: longitude ?? null,
    ip_address: ipAddress,
    device_info: deviceInfo ?? null,
    gps_accuracy: gpsAccuracy ?? null,
    trust_level: trustLevel ?? (method === 'facial' ? 'high' : method === 'web' ? 'medium' : 'low'),
    status: 'valid',
  });

  const dateKey = now.toISOString().split('T')[0];
  await AttendanceService.syncDailySummary(user.id, dateKey);

  return { record, resolvedType, skippedLunch };
};

export const registerRecord = async (req: AuthRequest, res: Response) => {
  try {
    const { userId, record_type, method, latitude, longitude, gps_accuracy, ip_address, device_info, biometric_score, biometric_threshold, biometric_context, detected_descriptor } = req.body;
    const requester = req.user;
    if (!requester) {
      return res.status(401).json({ success: false, error: 'Não autorizado.' });
    }

    const targetUserId = requester.role === 'kiosk' ? Number(userId) : requester.id;
    if (!targetUserId || Number.isNaN(targetUserId)) {
      return res.status(400).json({ success: false, error: 'Colaborador não informado.' });
    }

    const user = await User.findByPk(targetUserId);
    if (!user || user.status !== 'active') {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
    }

    const finalMethod =
      requester.role === 'kiosk'
        ? ((method as 'facial' | 'pin' | 'manual' | 'web') || 'facial')
        : 'web';

    // BLOCK REMOTE FACIAL: Only kiosk can use facial recognition
    if (finalMethod === 'facial' && requester.role !== 'kiosk') {
      return res.status(403).json({ success: false, error: 'Reconhecimento facial é permitido apenas no terminal da empresa.' });
    }

    if (requester.role === 'kiosk' && finalMethod === 'facial') {
      await validateKioskFacialAttempt({
        user,
        biometricScore: biometric_score,
        biometricThreshold: biometric_threshold,
        detectedDescriptor: detected_descriptor,
        deviceInfo: device_info,
        context:
          biometric_context && typeof biometric_context === 'object'
            ? (biometric_context as Record<string, unknown>)
            : null,
      });
    }

    const { record, resolvedType, skippedLunch } = await createValidatedRecord({
      user,
      requestedType: record_type,
      method: finalMethod,
      latitude,
      longitude,
      gpsAccuracy: typeof gps_accuracy === 'number' ? gps_accuracy : null,
      ipAddress: ip_address || getClientIp(req),
      deviceInfo: device_info || req.headers['user-agent'],
    });

    // PENDENCY FOR REMOTE CLOCK IN VIA APP
    if (requester.role !== 'kiosk') {
      const company = await CompanyProfile.findOne();
      let locationStatus: 'approved' | 'out_of_area' | null = null;
      let remoteReviewRequired = false;
      let distance = null;
      
      // se foi bloqueado a flag de gps pelo admin, e a pessoa conseguiu chegar ate aqui burlando o front, manda pra aprovacao e reprova
      if (!user.remote_clock_in_enabled) {
         remoteReviewRequired = true;
         locationStatus = 'out_of_area';
      } else if (company && company.latitude && company.longitude && company.allowed_radius && latitude && longitude) {
        distance = calculateDistance(
          parseFloat(company.latitude.toString()), 
          parseFloat(company.longitude.toString()), 
          Number(latitude), 
          Number(longitude)
        );
        locationStatus = distance <= company.allowed_radius ? 'approved' : 'out_of_area';
        remoteReviewRequired = locationStatus === 'out_of_area';
      }

      if (remoteReviewRequired) {
         record.status = 'pending_approval';
         record.location_status = locationStatus;
         record.location_distance = distance;
         await record.save();
      }
    }

    if (requester.role === 'kiosk' && finalMethod === 'facial') {
      await logBiometricEvent({
        userId: user.id,
        eventType: 'verification_success',
        method: 'facial',
        deviceInfo: device_info,
        matchScore: typeof biometric_score === 'number' ? biometric_score : null,
        threshold: typeof biometric_threshold === 'number' ? biometric_threshold : null,
        metadata: {
          recordType: resolvedType,
          recordId: record.id,
          validation: 'server',
          biometricContext:
            biometric_context && typeof biometric_context === 'object'
              ? biometric_context
              : null,
        },
      });
    }

    res.json({
      success: true,
      data: record,
      meta: {
        userName: user.name,
        recordType: resolvedType,
        skippedLunch,
      },
      message: `Ponto registrado como ${RECORD_TYPE_LABELS[resolvedType]}.`,
    });

    // Email delivery can wait on the SMTP server for several seconds. It must
    // not hold the kiosk response after the attendance record is persisted.
    void attemptTimeRecordEmail(user, record);
  } catch (error) {
    if (!(error instanceof BiometricValidationError)) console.error('Record register error:', error);
    const message = error instanceof Error ? error.message : 'Erro ao registrar ponto.';
    const statusCode = error instanceof BiometricValidationError
      ? error.statusCode
      : message.includes('marcação') || message.includes('jornada') || message.includes('próxima') || message.includes('inativo') || message.includes('competência')
        ? 409
        : 500;
    res.status(statusCode).json({ success: false, error: message });
  }
};

export const registerRecordByPin = async (req: AuthRequest, res: Response) => {
  try {
    const requester = req.user;
    if (!requester || requester.role !== 'kiosk') {
      return res.status(403).json({ success: false, error: 'Acesso restrito ao terminal autenticado.' });
    }

    const { pinCode, record_type, latitude, longitude, ip_address, device_info } = req.body as {
      pinCode?: string;
      record_type?: 'entry' | 'lunch_start' | 'lunch_end' | 'exit';
      latitude?: number | null;
      longitude?: number | null;
      ip_address?: string | null;
      device_info?: string | null;
    };

    if (!pinCode || pinCode.trim().length < 4) {
      return res.status(400).json({ success: false, error: 'PIN inválido.' });
    }

    const attemptKey = buildPinAttemptKey(req, device_info);
    const attemptState = getPinAttemptState(attemptKey);
    if (attemptState.lockedUntil && attemptState.lockedUntil > Date.now()) {
      const retryInSeconds = Math.max(Math.ceil((attemptState.lockedUntil - Date.now()) / 1000), 1);
      await logBiometricEvent({
        eventType: 'verification_failure',
        method: 'pin',
        deviceInfo: device_info,
        reason: 'pin_rate_limited',
        metadata: {
          validation: 'server',
          retryInSeconds,
          failedAttempts: attemptState.failedAttempts,
        },
        success: false,
      });
      return res.status(429).json({
        success: false,
        error: `PIN temporariamente bloqueado neste terminal. Tente novamente em ${retryInSeconds} segundos.`,
      });
    }

    const users = await User.findAll({
      where: {
        status: 'active',
        pin_code: { [Op.ne]: null },
        requires_time_tracking: true,
      },
      attributes: ['id', 'name', 'email', 'pin_code', 'status', 'requires_time_tracking'],
    });

    let matchedUser: User | null = null;
    for (const candidate of users) {
      if (await verifyPin(pinCode, candidate.pin_code)) {
        matchedUser = candidate;
        break;
      }
    }

    if (!matchedUser) {
      const nextAttemptState = registerPinFailure(attemptKey);
      const retryInSeconds = nextAttemptState.lockedUntil
        ? Math.max(Math.ceil((nextAttemptState.lockedUntil - Date.now()) / 1000), 1)
        : null;
      await logBiometricEvent({
        eventType: 'verification_failure',
        method: 'pin',
        deviceInfo: device_info,
        reason: nextAttemptState.lockedUntil ? 'pin_rate_limited' : 'pin_invalid',
        metadata: {
          validation: 'server',
          failedAttempts: nextAttemptState.failedAttempts,
          retryInSeconds,
        },
        success: false,
      });
      return res.status(401).json({ success: false, error: 'PIN não encontrado para nenhum colaborador ativo.' });
    }

    clearPinAttemptState(attemptKey);

    const { record, resolvedType, skippedLunch } = await createValidatedRecord({
      user: matchedUser,
      requestedType: record_type,
      method: 'pin',
      latitude,
      longitude,
      ipAddress: ip_address || getClientIp(req),
      deviceInfo: device_info || req.headers['user-agent'],
      trustLevel: 'low',
    });

    await logBiometricEvent({
      userId: matchedUser.id,
      eventType: 'pin_fallback',
      method: 'pin',
      deviceInfo: device_info,
      reason: 'Registro realizado por PIN no totem.',
      metadata: {
        recordType: resolvedType,
        recordId: record.id,
      },
    });

    await attemptTimeRecordEmail(matchedUser, record);

    return res.json({
      success: true,
      data: record,
      meta: {
        userId: matchedUser.id,
        userName: matchedUser.name,
        recordType: resolvedType,
        skippedLunch,
      },
      message: `Ponto registrado por PIN como ${RECORD_TYPE_LABELS[resolvedType]}.`,
    });
  } catch (error) {
    console.error('Record by pin error:', error);
    const message = error instanceof Error ? error.message : 'Erro ao registrar ponto por PIN.';
    const statusCode = message.includes('marcação') || message.includes('jornada') || message.includes('próxima') || message.includes('inativo') || message.includes('competência')
      ? 409
      : 500;
    return res.status(statusCode).json({ success: false, error: message });
  }
};

export const getMyRecords = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Não autorizado.' });

    const records = await TimeRecord.findAll({
      where: { user_id: userId },
      order: [['record_time', 'DESC']],
      limit: 100
    });

    res.json({ success: true, data: records.map((record) => serializeRecordWithGeoLinks(record)) });
  } catch (error) {
    console.error('Get records error:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar registros.' });
  }
};

export const getRecentRecords = async (req: AuthRequest, res: Response) => {
  try {
    const requester = req.user;
    if (!requester) {
      return res.status(401).json({ success: false, error: 'Usuário não autenticado.' });
    }

    const where: Record<string, unknown> = {};
    if (requester.role === 'manager') {
      const managerUser = await User.findByPk(requester.id, { attributes: ['id', 'department_id'] });
      const managedIds = await getManagedUserIds(requester.id, managerUser?.department_id, 'view_time_records');
      where.user_id = { [Op.in]: managedIds };
    } else if (requester.role === 'employee') {
      where.user_id = requester.id;
    }

    const records = await TimeRecord.findAll({
      where,
      include: [
        {
          model: User,
          attributes: ['name', 'manager_id', 'department_id'],
        },
      ],
      order: [['record_time', 'DESC']],
      limit: 10,
    });
    return res.json({ success: true, data: records.map((record) => serializeRecordWithGeoLinks(record)) });
  } catch (error) {
    console.error('Recent records error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao buscar registros.' });
  }
};

export const updateRecordStatus = async (req: AuthRequest, res: Response) => {
  try {
    const requester = req.user;
    if (!requester || !['admin', 'manager'].includes(requester.role)) {
      return res.status(403).json({ success: false, error: 'Acesso restrito ao RH administrativo.' });
    }

    const recordId = Number(req.params.id);
    const nextStatus = req.body?.status as TimeRecord['status'] | undefined;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    const adjustedTime = req.body?.adjusted_time;
    const adjustedRecordType = req.body?.adjusted_record_type as TimeRecord['record_type'] | undefined;
    if (!recordId || Number.isNaN(recordId)) {
      return res.status(400).json({ success: false, error: 'Registro inválido.' });
    }

    const allowedStatuses: Array<TimeRecord['status']> = ['valid', 'pending_approval', 'adjusted', 'rejected'];
    if (!nextStatus || !allowedStatuses.includes(nextStatus)) {
      return res.status(400).json({ success: false, error: 'Status de registro inválido.' });
    }

    if ((nextStatus === 'adjusted' || nextStatus === 'rejected') && !reason) {
      return res.status(400).json({ success: false, error: 'Informe o motivo do ajuste ou rejeição.' });
    }

    if (nextStatus === 'adjusted') {
      if (!adjustedTime) {
        return res.status(400).json({ success: false, error: 'Informe o novo horário da marcação ajustada.' });
      }

      const allowedRecordTypes: Array<Exclude<TimeRecord['record_type'], 'auto'>> = ['entry', 'lunch_start', 'lunch_end', 'exit'];
      if (!adjustedRecordType || !allowedRecordTypes.includes(adjustedRecordType as Exclude<TimeRecord['record_type'], 'auto'>)) {
        return res.status(400).json({ success: false, error: 'Informe um novo tipo válido para a marcação ajustada.' });
      }
    }

    const record = (await TimeRecord.findByPk(recordId, {
      include: [
        { model: User, attributes: ['id', 'name', 'email', 'manager_id', 'department_id'] },
        { model: User, as: 'reviewer', attributes: ['id', 'name'], required: false },
      ],
    })) as (TimeRecord & { User?: User; reviewer?: User | null }) | null;

    if (!record || !record.User) {
      return res.status(404).json({ success: false, error: 'Registro não encontrado.' });
    }

    if (requester.role === 'manager') {
      const managerUser = await User.findByPk(requester.id, { attributes: ['id', 'department_id'] });
      const isResponsible = await isManagerResponsibleForUser(requester.id, managerUser?.department_id, record.User, 'manage_time_records');
      if (!isResponsible) {
        return res.status(403).json({ success: false, error: 'Você não pode administrar registros fora da sua equipe.' });
      }
    }

    await assertPeriodOpen(record.record_time, 'alterar marcações já fechadas');

    const oldStatus = record.status;
    const oldType = record.record_type;
    const oldTime = record.record_time;

    if (nextStatus === 'adjusted') {
      record.record_time = parseAdjustedTime(adjustedTime, new Date(record.record_time));
      record.record_type = adjustedRecordType as Exclude<TimeRecord['record_type'], 'auto'>;
    }

    record.status = nextStatus;
    record.reviewed_by = requester.id;
    record.reviewed_at = new Date();
    record.review_reason = reason || null;
    await record.save();

    const dateKey = record.record_time.toISOString().split('T')[0];
    await AttendanceService.syncDailySummary(record.user_id, dateKey);

    await AuditService.log({
      user_id: requester.id,
      action: 'REVIEW_RECORD',
      entity_name: 'time_records',
      entity_id: record.id,
      old_value: { status: oldStatus, record_type: oldType, record_time: oldTime },
      new_value: { status: record.status, record_type: record.record_type, record_time: record.record_time, reason },
    }, req);

    await record.reload({
      include: [
        { model: User, attributes: ['id', 'name', 'email', 'manager_id', 'department_id'] },
        { model: User, as: 'reviewer', attributes: ['id', 'name'], required: false },
      ],
    });

    await attemptTimeRecordEmail(record.User!, record);

    return res.json({
      success: true,
      data: record,
      message: `Registro atualizado para ${nextStatus}.`,
    });
  } catch (error) {
    console.error('Update record status error:', error);
    const message = error instanceof Error ? error.message : 'Erro ao atualizar o status do registro.';
    const statusCode = message.includes('competência') ? 409 : 500;
    return res.status(statusCode).json({ success: false, error: message });
  }
};

export const registerRemoteRecord = async (req: AuthRequest, res: Response) => {
  let recordCreated = false;
  const discardUploadedPhoto = async () => {
    if (!recordCreated && req.file?.path) {
      await fs.unlink(req.file.path).catch(() => undefined);
    }
  };
  const rejectRemoteRecord = async (status: number, error: string) => {
    await discardUploadedPhoto();
    return res.status(status).json({ success: false, error });
  };
  try {
    const userId = req.user?.id;
    if (!userId) return rejectRemoteRecord(401, 'Não autorizado');

    const user = await User.findByPk(userId);
    if (!user) return rejectRemoteRecord(404, 'Usuário não encontrado.');

    if (!user.requires_time_tracking) {
      return rejectRemoteRecord(403, 'Seu usuário não está sujeito ao controle de ponto.');
    }

    if (!user.remote_clock_in_enabled) {
      return rejectRemoteRecord(403, 'Ponto remoto não autorizado para o seu usuário. Solicite liberação ao gestor.');
    }

    const { latitude, longitude, record_type, gps_accuracy } = req.body;
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);
    const parsedGpsAccuracy = gps_accuracy ? Number(gps_accuracy) : null;
    const photoUrl = req.file ? `/uploads/remote_photos/${req.file.filename}` : null;

    if (!record_type) {
      return rejectRemoteRecord(400, 'O tipo de registro é obrigatório.');
    }

    if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) {
      return rejectRemoteRecord(400, 'Localização e tipo de registro são obrigatórios.');
    }

    if (!photoUrl) {
      return rejectRemoteRecord(400, 'A foto é obrigatória para o registro remoto.');
    }

    const company = await CompanyProfile.findOne();
    if (!company) {
      return rejectRemoteRecord(500, 'Empresa não configurada.');
    }

    let distance = null;
    let locationStatus: 'approved' | 'out_of_area' | null = null;
    let remoteReviewRequired = false;

    if (company.latitude && company.longitude && company.allowed_radius) {
      distance = calculateDistance(
        parseFloat(company.latitude.toString()), 
        parseFloat(company.longitude.toString()), 
        parsedLatitude, 
        parsedLongitude
      );

      locationStatus = distance <= company.allowed_radius ? 'approved' : 'out_of_area';
      remoteReviewRequired = locationStatus === 'out_of_area';
    }

    const now = new Date();
    await assertPeriodOpen(now, 'registrar ponto na competência atual');
    
    const { start, end } = getDayBounds(now);
    const existingRecords = await TimeRecord.findAll({
      where: {
        user_id: user.id,
        status: { [Op.ne]: 'rejected' },
        record_time: { [Op.between]: [start, end] },
      },
      order: [['record_time', 'ASC']],
    });

    const lastRecord = existingRecords[existingRecords.length - 1];
    if (lastRecord) {
      const diffMs = now.getTime() - new Date(lastRecord.record_time).getTime();
      if (diffMs < 60_000) {
        return rejectRemoteRecord(409, 'Já existe uma marcação recente para este colaborador. Aguarde 1 minuto para tentar novamente.');
      }
    }

    const resolvedType = normalizeManualType(record_type, existingRecords);

    const photoData = await fs.readFile(req.file!.path);
    const photoExpiresAt = new Date(now);
    photoExpiresAt.setUTCMonth(photoExpiresAt.getUTCMonth() + 3);

    const newRecord = await TimeRecord.create({
      user_id: userId,
      record_time: now,
      record_type: resolvedType,
      method: 'web',
      latitude: parsedLatitude,
      longitude: parsedLongitude,
      location_distance: distance,
      location_status: locationStatus,
      photo_url: photoUrl,
      ip_address: getClientIp(req),
      device_info: req.headers['user-agent'],
      gps_accuracy: parsedGpsAccuracy,
      trust_level: 'medium',
      status: remoteReviewRequired ? 'pending_approval' : 'valid',
    });

    try {
      await RemotePhotoEvidence.create({
        record_id: newRecord.id,
        photo_data: photoData,
        mime_type: req.file!.mimetype,
        expires_at: photoExpiresAt,
        deleted_at: null,
      });
    } catch (evidenceError) {
      await newRecord.destroy().catch(() => undefined);
      throw evidenceError;
    }
    recordCreated = true;

    const dateKey = now.toISOString().split('T')[0];
    await AttendanceService.syncDailySummary(userId, dateKey);

    const typeTranslations: Record<string, string> = {
      entry: 'Entrada',
      lunch_start: 'Saída para Almoço',
      lunch_end: 'Retorno do Almoço',
      exit: 'Saída',
    };
    const translatedType = typeTranslations[resolvedType] || resolvedType;

    await attemptTimeRecordEmail(user, newRecord);

    return res.status(201).json({
      success: true,
      message: remoteReviewRequired
        ? `Ponto remoto (${translatedType}) salvo fora da área permitida e enviado para aprovação.`
        : `Ponto registrado com sucesso como ${translatedType}.`,
      data: serializeRecordWithGeoLinks(newRecord),
      distance,
      locationStatus,
      mapUrl: buildGoogleMapsUrl(parsedLatitude, parsedLongitude),
      reviewRequired: remoteReviewRequired,
    });

  } catch (error) {
    console.error('Remote record error:', error);
    await discardUploadedPhoto();
    if (error instanceof Error && error.message.includes('competência')) {
      return res.status(403).json({ success: false, error: error.message });
    }
    if (error instanceof Error && error.message.includes('4 marca')) {
      return res.status(409).json({ success: false, error: error.message });
    }
    return res.status(500).json({ success: false, error: 'Erro interno ao processar o ponto remoto.' });
  }
};

export const getEmailDeliveryFailures = async (req: AuthRequest, res: Response) => {
  try {
    const requestedLimit = Number(req.query.limit || 100);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 200) : 100;

    const failures = await EmailDeliveryFailure.findAll({
      limit,
      order: [['attempted_at', 'DESC']],
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'registration_number'] },
        { model: TimeRecord, as: 'record', attributes: ['id', 'record_time', 'record_type', 'method', 'status'] },
      ],
    });

    return res.json({ success: true, data: failures });
  } catch (error) {
    console.error('Email delivery failures list error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao consultar as falhas de envio de e-mail.' });
  }
};

export const getEmailDeliveryLogs = async (req: AuthRequest, res: Response) => {
  try {
    const requestedLimit = Number(req.query.limit || 100);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 200) : 100;
    const logs = await EmailDeliveryLog.findAll({
      limit, order: [['attempted_at', 'DESC']],
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'registration_number'] },
        { model: TimeRecord, as: 'record', attributes: ['id', 'record_time', 'record_type', 'method', 'status'] },
      ],
    });
    return res.json({ success: true, data: logs });
  } catch (error) {
    console.error('Email delivery logs list error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao consultar os registros de envio de e-mail.' });
  }
};
