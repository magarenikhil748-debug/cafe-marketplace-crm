import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppError, ErrorCodes } from '../../common/errors/app-error'
import { sendSuccess } from '../../common/utils/api-response'
import {
  adminCafeParamsSchema,
  listAdminCafesQuerySchema,
  updateCafeApprovalSchema,
  updateCafeStatusSchema,
} from './admin.schema'
import { AdminService } from './admin.service'

const requireAdminUserId = (request: FastifyRequest) => {
  if (!request.authUser || request.authUser.role !== 'ADMIN') {
    throw new AppError(403, ErrorCodes.AUTH_FORBIDDEN, 'Platform administrator access is required')
  }
  return request.authUser.id
}

export const listCafes = async (request: FastifyRequest, reply: FastifyReply) => {
  requireAdminUserId(request)
  const query = listAdminCafesQuerySchema.parse(request.query)
  const service = new AdminService(request.server.prisma)
  const cafes = await service.listCafes(query)

  return sendSuccess(reply, 'Admin cafes fetched successfully', { cafes })
}

export const updateCafeApproval = async (request: FastifyRequest, reply: FastifyReply) => {
  const adminUserId = requireAdminUserId(request)
  const params = adminCafeParamsSchema.parse(request.params)
  const input = updateCafeApprovalSchema.parse(request.body)
  const service = new AdminService(request.server.prisma)
  const cafe = await service.updateApproval(adminUserId, params.restaurantId, input.isApproved)

  return sendSuccess(reply, input.isApproved ? 'Cafe approved' : 'Cafe unapproved', { cafe })
}

export const updateCafeStatus = async (request: FastifyRequest, reply: FastifyReply) => {
  const adminUserId = requireAdminUserId(request)
  const params = adminCafeParamsSchema.parse(request.params)
  const input = updateCafeStatusSchema.parse(request.body)
  const service = new AdminService(request.server.prisma)
  const cafe = await service.updateStatus(adminUserId, params.restaurantId, input.isActive)

  return sendSuccess(reply, input.isActive ? 'Cafe reactivated' : 'Cafe suspended', { cafe })
}
