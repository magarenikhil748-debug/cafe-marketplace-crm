import type { PrismaClient, UserRole } from '@prisma/client'
import type { Server as SocketIOServer } from 'socket.io'

type AuthUser = {
  id: string
  name: string
  email: string
  role: UserRole
}

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
    io: SocketIOServer
  }

  interface FastifyRequest {
    authUser?: AuthUser
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string
      role: UserRole
      email: string
    }
    user: {
      sub: string
      role: UserRole
      email: string
    }
  }
}


