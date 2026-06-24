import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppError, ErrorCodes } from '../../common/errors/app-error'
import { sendSuccess } from '../../common/utils/api-response'
import {
  createMemberSchema,
  restaurantIdParamsSchema,
  updateUserSchema,
  userIdParamsSchema,
} from './users.schema'
import { UsersService } from './users.service'

export const listMembers = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!request.authUser) {
    throw new AppError(401, ErrorCodes.AUTH_UNAUTHORIZED, 'Authentication is required')
  }

  const params = restaurantIdParamsSchema.parse(request.params)
  const service = new UsersService((request.server as any).prisma)
  const members = await service.listMembers(request.authUser.id, params.restaurantId)

  return sendSuccess(reply, 'Restaurant members fetched successfully', { members })
}

export const createMember = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!request.authUser) {
    throw new AppError(401, ErrorCodes.AUTH_UNAUTHORIZED, 'Authentication is required')
  }

  const params = restaurantIdParamsSchema.parse(request.params)
  const input = createMemberSchema.parse(request.body)
  const service = new UsersService((request.server as any).prisma)
  const result = await service.createMember(request.authUser.id, params.restaurantId, input)

  return sendSuccess(reply, 'Restaurant member created successfully', result, 201)
}

export const updateUser = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!request.authUser) {
    throw new AppError(401, ErrorCodes.AUTH_UNAUTHORIZED, 'Authentication is required')
  }

  const params = userIdParamsSchema.parse(request.params)
  const input = updateUserSchema.parse(request.body)
  const service = new UsersService((request.server as any).prisma)
  const user = await service.updateUser(request.authUser.id, params.userId, input)

  return sendSuccess(reply, 'User updated successfully', { user })
}


