import fastifyJwt from '@fastify/jwt'
import fp from 'fastify-plugin'
import { env } from '../config/env'

export const authPlugin = fp(async (fastify) => {
  await fastify.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.JWT_EXPIRES_IN,
    },
  })
})


