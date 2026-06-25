import fastifyRateLimit from '@fastify/rate-limit'
import fp from 'fastify-plugin'
import { AppError, ErrorCodes } from '../common/errors/app-error'
import { env } from '../config/env'

export const rateLimitPlugin = fp(async (fastify) => {
  await fastify.register(fastifyRateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    errorResponseBuilder: (_request, context) =>
      new AppError(
        429,
        ErrorCodes.RATE_LIMITED,
        'Too many requests. Please wait before trying again.',
        { retryAfter: context.after },
      ),
  })
})
