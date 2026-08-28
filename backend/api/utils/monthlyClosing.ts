import { MonthlyClosing } from '../models/MonthlyClosing.js';

const parseDateLike = (value: Date | string) => {
  if (value instanceof Date) return value;

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
  }

  return new Date(value);
};

export const getPeriodMonthFromDate = (value: Date | string) => {
  const parsed = parseDateLike(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Data inválida para validar a competência.');
  }

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
};

export const assertPeriodOpen = async (
  value: Date | string,
  actionLabel = 'realizar alterações nesta competência'
) => {
  const periodMonth = getPeriodMonthFromDate(value);
  const closure = await MonthlyClosing.findOne({
    where: {
      period_month: periodMonth,
      status: 'closed',
    },
  });

  if (closure) {
    throw new Error(`A competência ${periodMonth} está fechada. Reabra o período antes de ${actionLabel}.`);
  }

  return periodMonth;
};
