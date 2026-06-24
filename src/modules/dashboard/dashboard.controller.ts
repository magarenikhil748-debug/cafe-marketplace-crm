import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppError, ErrorCodes } from '../../common/errors/app-error'
import { sendSuccess } from '../../common/utils/api-response'
import {
  dashboardQuerySchema,
  restaurantParamsSchema,
  topItemsQuerySchema,
} from './dashboard.schema'
import { DashboardService } from './dashboard.service'

const requireUserId = (request: FastifyRequest) => {
  if (!request.authUser) {
    throw new AppError(401, ErrorCodes.AUTH_UNAUTHORIZED, 'Authentication is required')
  }
  return request.authUser.id
}

export const today = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = restaurantParamsSchema.parse(request.params)
  const query = dashboardQuerySchema.parse(request.query)
  const service = new DashboardService((request.server as any).prisma)
  const dashboard = await service.today(userId, params.restaurantId, query)

  return sendSuccess(reply, 'Today dashboard fetched successfully', dashboard)
}

export const topItems = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = restaurantParamsSchema.parse(request.params)
  const query = topItemsQuerySchema.parse(request.query)
  const service = new DashboardService((request.server as any).prisma)
  const items = await service.topItems(userId, params.restaurantId, query)

  return sendSuccess(reply, 'Top selling items fetched successfully', { items })
}

export const hourlySales = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = restaurantParamsSchema.parse(request.params)
  const query = dashboardQuerySchema.parse(request.query)
  const service = new DashboardService((request.server as any).prisma)
  const hours = await service.hourlySales(userId, params.restaurantId, query)

  return sendSuccess(reply, 'Hourly sales fetched successfully', { hours })
}


