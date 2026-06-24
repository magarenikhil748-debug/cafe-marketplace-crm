import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppError, ErrorCodes } from '../../common/errors/app-error'
import { sendSuccess } from '../../common/utils/api-response'
import {
  branchParamsSchema,
  createTableSchema,
  tableParamsSchema,
  updateTableSchema,
} from './tables.schema'
import { TablesService } from './tables.service'

const requireUserId = (request: FastifyRequest) => {
  if (!request.authUser) {
    throw new AppError(401, ErrorCodes.AUTH_UNAUTHORIZED, 'Authentication is required')
  }
  return request.authUser.id
}

export const createTable = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = branchParamsSchema.parse(request.params)
  const input = createTableSchema.parse(request.body)
  const service = new TablesService((request.server as any).prisma)
  const table = await service.create(userId, params.branchId, input)

  return sendSuccess(reply, 'Table created successfully', { table }, 201)
}

export const listTables = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = branchParamsSchema.parse(request.params)
  const service = new TablesService((request.server as any).prisma)
  const tables = await service.list(userId, params.branchId)

  return sendSuccess(reply, 'Tables fetched successfully', { tables })
}

export const getTable = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = tableParamsSchema.parse(request.params)
  const service = new TablesService((request.server as any).prisma)
  const table = await service.get(userId, params.tableId)

  return sendSuccess(reply, 'Table fetched successfully', { table })
}

export const updateTable = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = tableParamsSchema.parse(request.params)
  const input = updateTableSchema.parse(request.body)
  const service = new TablesService((request.server as any).prisma)
  const table = await service.update(userId, params.tableId, input)

  return sendSuccess(reply, 'Table updated successfully', { table })
}

export const deleteTable = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = tableParamsSchema.parse(request.params)
  const service = new TablesService((request.server as any).prisma)
  const table = await service.delete(userId, params.tableId)

  return sendSuccess(reply, 'Table deleted successfully', { table })
}

export const regenerateQr = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = tableParamsSchema.parse(request.params)
  const service = new TablesService((request.server as any).prisma)
  const table = await service.regenerateQr(userId, params.tableId)

  return sendSuccess(reply, 'Table QR regenerated successfully', { table })
}


