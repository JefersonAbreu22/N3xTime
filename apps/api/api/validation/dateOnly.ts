import { z } from 'zod';

export const DATE_ONLY_MESSAGE = 'Informe uma data válida com ano de quatro dígitos a partir de 1900.';

export const dateOnlySchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, DATE_ONLY_MESSAGE)
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1900) return false;
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year
      && parsed.getUTCMonth() === month - 1
      && parsed.getUTCDate() === day;
  }, DATE_ONLY_MESSAGE);
