import assert from 'node:assert/strict';
import { applyPartialAbsenceCredit, getWorkedMinutesForDay } from '../services/AttendanceCalculator.js';
import type { TimeRecord } from '../models/TimeRecord.js';
import type { WorkSchedule } from '../models/WorkSchedule.js';

const record = (id: number, recordType: TimeRecord['record_type'], time: string) => ({
  id,
  record_type: recordType,
  record_time: new Date(`2026-09-16T${time}:00-03:00`),
  status: 'valid',
}) as TimeRecord;

const incompleteJourney = [
  record(1, 'entry', '07:36'),
  record(2, 'lunch_start', '11:06'),
  record(3, 'lunch_end', '12:08'),
];

const worked = getWorkedMinutesForDay(
  incompleteJourney,
  { lunch_duration: 60 } as WorkSchedule,
  { justifiedExitTime: '14:16' }
);

assert.equal(worked.workedMinutes, 338, 'deve contabilizar as marcações até o início da declaração');
assert.equal(worked.hasCompleteJourney, false, 'a declaração não deve criar uma batida de saída real');
assert.equal(worked.exitTime, null, 'a saída ausente deve continuar visível como ausente');

const credited = applyPartialAbsenceCredit({
  requiredMinutes: 540,
  workedMinutes: worked.workedMinutes,
  absenceMinutes: 224,
});

assert.equal(credited.requiredMinutes, 338, 'o abono deve ser limitado ao tempo necessário para completar a jornada');
assert.equal(worked.workedMinutes - credited.requiredMinutes, 0, 'o saldo final do caso deve ficar zerado');

console.log('Cálculo de jornada incompleta com declaração validado.');
