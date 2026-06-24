import fastifyRateLimit from '@fastify/rate-limit'
import fp from 'fastify-plugin'
import { env } from '../config/env'

export const rateLimitPlugin = fp(async (fastify) => {
  await fastify.register(fastifyRateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
  })
})


