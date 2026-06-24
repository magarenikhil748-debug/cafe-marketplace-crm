import type { FastifyCorsOptions } from '@fastify/cors'
import { env } from './env'

const parseOrigins = (value: string): string[] | boolean => {
  if (value.trim() === '*') {
    return true
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

export const corsOptions: FastifyCorsOptions = {
  origin: parseOrigins(env.CORS_ORIGIN),
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
}


