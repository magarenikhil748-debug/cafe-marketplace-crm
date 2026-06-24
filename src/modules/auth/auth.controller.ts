import type { FastifyReply, FastifyRequest } from 'fastify'
import type { UserRole } from '@prisma/client'
import { AppError, ErrorCodes } from '../../common/errors/app-error'
import { sendSuccess } from '../../common/utils/api-response'
import { AuthService } from './auth.service'
import { loginSchema, registerSchema } from './auth.schema'

const signAccessToken = (
  request: FastifyRequest,
  user: { id: string; role: UserRole; email: string },
) =>
  request.server.jwt.sign({
    sub: user.id,
    role: user.role,
    email: user.email,
  })

export const register = async (request: FastifyRequest, reply: FastifyReply) => {
  const input = registerSchema.parse(request.body)
  const service = new AuthService((request.server as any).prisma)
  const result = await service.register(input)
  const accessToken = signAccessToken(request, result.user)

  return sendSuccess(
    reply,
    'Account created successfully',
    {
      accessToken,
      user: result.user,
      restaurant: result.restaurant,
    },
    201,
  )
}

export const login = async (request: FastifyRequest, reply: FastifyReply) => {
  const input = loginSchema.parse(request.body)
  const service = new AuthService((request.server as any).prisma)
  const user = await service.login(input)
  const accessToken = signAccessToken(request, user)

  return sendSuccess(reply, 'Logged in successfully', { accessToken, user })
}

export const me = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!request.authUser) {
    throw new AppError(401, ErrorCodes.AUTH_UNAUTHORIZED, 'Authentication is required')
  }

  const service = new AuthService((request.server as any).prisma)
  const user = await service.me(request.authUser.id)

  return sendSuccess(reply, 'Current user fetched successfully', { user })
}


