import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppError, ErrorCodes } from '../errors/app-error'

export const requireAuth = async (request: FastifyRequest, _reply: FastifyReply) => {
  try {
    const payload = await request.jwtVerify<{ sub: string; role: string; email: string }>()
    const user = await (request.server as any).prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    })

    if (!user?.isActive) {
      throw new AppError(401, ErrorCodes.AUTH_UNAUTHORIZED, 'Authentication is required')
    }

    request.authUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }

    throw new AppError(401, ErrorCodes.AUTH_UNAUTHORIZED, 'Authentication is required')
  }
}


