import fp from 'fastify-plugin'
import { Server } from 'socket.io'
import type { UserRole } from '@prisma/client'
import { env } from '../config/env'

type ClientAuth = {
  token?: string
}

type RestaurantJoinPayload = {
  restaurantId?: string
}

type BranchJoinPayload = {
  branchId?: string
}

type OrderJoinPayload = {
  orderId?: string
}

export const socketPlugin = fp(async (fastify) => {
  const io = new Server(fastify.server, {
    cors: {
      origin:
        env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
      credentials: true,
    },
  })

  fastify.decorate('io', io)

  io.use(async (socket, next) => {
    const auth = socket.handshake.auth as ClientAuth | undefined
    const token = auth?.token

    if (!token) {
      return next()
    }

    try {
      const payload = fastify.jwt.verify<{ sub: string; role: UserRole; email: string }>(token)
      socket.data.userId = payload.sub
      socket.data.role = payload.role
      return next()
    } catch {
      return next(new Error('Invalid socket authentication token'))
    }
  })

  io.on('connection', (socket) => {
    socket.on('restaurant:join', async (payload: RestaurantJoinPayload) => {
      if (!payload.restaurantId || !socket.data.userId) {
        socket.emit('socket:error', { message: 'Authentication is required' })
        return
      }

      const membership = await (fastify as any).prisma.restaurantMember.findFirst({
        where: { restaurantId: payload.restaurantId, userId: socket.data.userId },
      })

      if (!membership) {
        socket.emit('socket:error', { message: 'Restaurant access denied' })
        return
      }

      socket.join(`restaurant:${payload.restaurantId}`)
    })

    socket.on('branch:join', async (payload: BranchJoinPayload) => {
      if (!payload.branchId || !socket.data.userId) {
        socket.emit('socket:error', { message: 'Authentication is required' })
        return
      }

      const branch = await (fastify as any).prisma.branch.findUnique({ where: { id: payload.branchId } })
      if (!branch) {
        socket.emit('socket:error', { message: 'Branch not found' })
        return
      }

      const membership = await (fastify as any).prisma.restaurantMember.findFirst({
        where: { restaurantId: branch.restaurantId, userId: socket.data.userId },
      })

      if (!membership) {
        socket.emit('socket:error', { message: 'Branch access denied' })
        return
      }

      socket.join(`branch:${payload.branchId}`)
    })

    socket.on('order:join', async (payload: OrderJoinPayload) => {
      if (!payload.orderId) {
        socket.emit('socket:error', { message: 'Order id is required' })
        return
      }

      const order = await (fastify as any).prisma.order.findUnique({
        where: { id: payload.orderId },
        select: { id: true },
      })

      if (!order) {
        socket.emit('socket:error', { message: 'Order not found' })
        return
      }

      socket.join(`order:${payload.orderId}`)
    })
  })

  fastify.addHook('onClose', async () => {
    await io.close()
  })
})


