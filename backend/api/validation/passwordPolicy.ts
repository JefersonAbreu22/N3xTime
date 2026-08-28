import { z } from 'zod';

export const PASSWORD_POLICY_MESSAGE = 'Use de 8 a 72 caracteres, incluindo letra maiúscula, minúscula e número.';

export const passwordSchema = z
  .string()
  .min(8, PASSWORD_POLICY_MESSAGE)
  .max(72, PASSWORD_POLICY_MESSAGE)
  .regex(/[a-z]/, PASSWORD_POLICY_MESSAGE)
  .regex(/[A-Z]/, PASSWORD_POLICY_MESSAGE)
  .regex(/[0-9]/, PASSWORD_POLICY_MESSAGE);
