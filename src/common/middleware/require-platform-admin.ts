import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppError, ErrorCodes } from '../errors/app-error'

export const requirePlatformAdmin = async (request: FastifyRequest, _reply: FastifyReply) => {
  if (!request.authUser) {
    throw new AppError(401, ErrorCodes.AUTH_UNAUTHORIZED, 'Authentication is required')
  }

  if (request.authUser.role !== 'ADMIN') {
    throw new AppError(403, ErrorCodes.AUTH_FORBIDDEN, 'Platform administrator access is required')
  }
}
