import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppError, ErrorCodes } from '../../common/errors/app-error'
import { sendSuccess } from '../../common/utils/api-response'
import {
  branchParamsSchema,
  createBranchSchema,
  restaurantParamsSchema,
  updateBranchSchema,
} from './branches.schema'
import { BranchesService } from './branches.service'

const requireUserId = (request: FastifyRequest) => {
  if (!request.authUser) {
    throw new AppError(401, ErrorCodes.AUTH_UNAUTHORIZED, 'Authentication is required')
  }
  return request.authUser.id
}

export const createBranch = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = restaurantParamsSchema.parse(request.params)
  const input = createBranchSchema.parse(request.body)
  const service = new BranchesService((request.server as any).prisma)
  const branch = await service.create(userId, params.restaurantId, input)

  return sendSuccess(reply, 'Branch created successfully', { branch }, 201)
}

export const listBranches = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = restaurantParamsSchema.parse(request.params)
  const service = new BranchesService((request.server as any).prisma)
  const branches = await service.list(userId, params.restaurantId)

  return sendSuccess(reply, 'Branches fetched successfully', { branches })
}

export const updateBranch = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = branchParamsSchema.parse(request.params)
  const input = updateBranchSchema.parse(request.body)
  const service = new BranchesService((request.server as any).prisma)
  const branch = await service.update(userId, params.branchId, input)

  return sendSuccess(reply, 'Branch updated successfully', { branch })
}

export const deleteBranch = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = branchParamsSchema.parse(request.params)
  const service = new BranchesService((request.server as any).prisma)
  const branch = await service.delete(userId, params.branchId)

  return sendSuccess(reply, 'Branch deleted successfully', { branch })
}


