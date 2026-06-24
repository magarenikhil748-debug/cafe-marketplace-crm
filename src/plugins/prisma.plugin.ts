import fp from 'fastify-plugin'
import { PrismaClient } from '@prisma/client'
import { env } from '../config/env'

export const prismaPlugin = fp(async (fastify) => {
  const prisma = new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

  await prisma.$connect()
  fastify.decorate('prisma', prisma)

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect()
  })
})


