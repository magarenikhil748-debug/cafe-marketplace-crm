import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config({ path: process.env['NODE_ENV'] === 'test' ? '.env.test' : '.env' })

const booleanFromEnv = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .default(false)

const optionalEnvValue = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
)

const optionalEnvUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().url().optional(),
)

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    PORT: z.coerce.number().int().positive().default(3000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().default('7d'),
    FRONTEND_URL: z.string().url().default('http://localhost:5173'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(8).max(14).default(12),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    RATE_LIMIT_WINDOW: z.string().default('1 minute'),
    PUBLIC_ORDER_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    PUBLIC_ORDER_RATE_LIMIT_WINDOW: z.string().default('10 minutes'),
    TRUST_PROXY: booleanFromEnv,
    SENTRY_DSN: optionalEnvUrl,
    CLOUDINARY_CLOUD_NAME: optionalEnvValue,
    CLOUDINARY_API_KEY: optionalEnvValue,
    CLOUDINARY_API_SECRET: optionalEnvValue,
    LOG_LEVEL: z.string().default('info'),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production' && value.CORS_ORIGIN.trim() === '*') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ORIGIN'],
        message: 'CORS_ORIGIN cannot be "*" in production',
      })
    }
  })

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const details = parsed.error.flatten().fieldErrors
  throw new Error(`Invalid environment configuration: ${JSON.stringify(details)}`)
}

export const env = parsed.data
export type Env = typeof env
