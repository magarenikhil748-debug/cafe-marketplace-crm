import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppError, ErrorCodes } from '../../common/errors/app-error'
import { sendSuccess } from '../../common/utils/api-response'
import { cafeSlugParamsSchema, cafeTableOrderSchema } from '../public/public.schema'
import { emitOrderCreated, emitOrderStatusUpdated } from './orders.events'
import {
  createManualOrderSchema,
  createPublicOrderSchema,
  listOrdersQuerySchema,
  orderParamsSchema,
  restaurantParamsSchema,
  updateOrderStatusSchema,
} from './orders.schema'
import { OrdersService } from './orders.service'

const requireUserId = (request: FastifyRequest) => {
  if (!request.authUser) {
    throw new AppError(401, ErrorCodes.AUTH_UNAUTHORIZED, 'Authentication is required')
  }
  return request.authUser.id
}

const extractIdempotencyKey = (request: FastifyRequest) => {
  const headerValue = request.headers['idempotency-key']
  return Array.isArray(headerValue) ? headerValue[0] : headerValue
}

const requireTableQrToken = (body: unknown) => {
  const qrToken =
    typeof body === 'object' && body !== null && 'qrToken' in body
      ? (body as { qrToken?: unknown }).qrToken
      : undefined

  if (typeof qrToken !== 'string' || qrToken.trim().length === 0) {
    throw new AppError(
      403,
      ErrorCodes.QR_REQUIRED,
      'Please scan the QR code on your table to place an order.',
    )
  }
}

export const createPublicOrder = async (request: FastifyRequest, reply: FastifyReply) => {
  requireTableQrToken(request.body)
  const body = createPublicOrderSchema.parse({
    ...(request.body as Record<string, unknown>),
    idempotencyKey:
      (request.body as { idempotencyKey?: string } | undefined)?.idempotencyKey ??
      extractIdempotencyKey(request),
  })
  const service = new OrdersService(request.server.prisma)
  const result = await service.createPublicOrder(body)

  emitCreatedOrderIfNeeded(request, result.wasIdempotent, result.order)

  return sendSuccess(
    reply,
    result.wasIdempotent ? 'Existing order returned' : 'Order placed successfully',
    {
      order: result.order,
    },
    result.wasIdempotent ? 200 : 201,
  )
}

export const createCafeOrder = async (request: FastifyRequest, reply: FastifyReply) => {
  requireTableQrToken(request.body)
  const params = cafeSlugParamsSchema.parse(request.params)
  const body = cafeTableOrderSchema.parse({
    ...(request.body as Record<string, unknown>),
    idempotencyKey:
      (request.body as { idempotencyKey?: string } | undefined)?.idempotencyKey ??
      extractIdempotencyKey(request),
  })
  const service = new OrdersService(request.server.prisma)
  const result = await service.createCafeOrder(params.slug, body)

  emitCreatedOrderIfNeeded(request, result.wasIdempotent, result.order)

  return sendSuccess(
    reply,
    result.wasIdempotent ? 'Existing order returned' : 'Cafe order placed successfully',
    { order: result.order },
    result.wasIdempotent ? 200 : 201,
  )
}

export const createManualOrder = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = restaurantParamsSchema.parse(request.params)
  const body = createManualOrderSchema.parse(request.body)
  const service = new OrdersService(request.server.prisma)
  const result = await service.createManualOrder(userId, params.restaurantId, body)

  emitCreatedOrderIfNeeded(request, false, result.order)

  return sendSuccess(reply, 'Manual order created successfully', { order: result.order }, 201)
}

export const listOrders = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = restaurantParamsSchema.parse(request.params)
  const query = listOrdersQuerySchema.parse(request.query)
  const service = new OrdersService(request.server.prisma)
  const result = await service.listOrders(userId, params.restaurantId, query)

  return sendSuccess(reply, 'Orders fetched successfully', result)
}

export const getOrder = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = orderParamsSchema.parse(request.params)
  const service = new OrdersService(request.server.prisma)
  const order = await service.getOrder(userId, params.orderId)

  return sendSuccess(reply, 'Order fetched successfully', { order })
}

export const updateOrderStatus = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = orderParamsSchema.parse(request.params)
  const input = updateOrderStatusSchema.parse(request.body)
  const service = new OrdersService(request.server.prisma)
  const result = await service.updateStatus(userId, params.orderId, input.status)

  emitOrderStatusUpdated(request.server.io, {
    orderId: result.order.id,
    orderNumber: result.order.orderNumber,
    restaurantId: result.order.restaurantId,
    branchId: result.order.branchId,
    oldStatus: result.oldStatus,
    newStatus: result.newStatus,
    updatedAt: result.order.updatedAt,
  })

  return sendSuccess(reply, 'Order status updated successfully', { order: result.order })
}

export const getPublicOrderStatus = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = orderParamsSchema.parse(request.params)
  const service = new OrdersService(request.server.prisma)
  const order = await service.getPublicOrderStatus(params.orderId)

  return sendSuccess(reply, 'Order status fetched successfully', { order })
}

const isCreatedOrderPayload = (
  value: unknown,
): value is {
  id: string
  orderNumber: string
  restaurantId: string
  branchId: string
  tableId: string | null
  tableNumber: string | null
  status: 'PLACED'
  source: 'QR' | 'MANUAL'
  orderType: 'DINE_IN' | 'TAKEAWAY'
  totalInPaise: number
  items: Array<{ name: string; quantity: number; totalPriceInPaise: number }>
  createdAt: string
} => {
  return typeof value === 'object' && value !== null && 'id' in value && 'items' in value
}

const emitCreatedOrderIfNeeded = (
  request: FastifyRequest,
  wasIdempotent: boolean,
  order: unknown,
) => {
  if (wasIdempotent || !isCreatedOrderPayload(order)) {
    return
  }

  emitOrderCreated(request.server.io, {
    orderId: order.id,
    orderNumber: order.orderNumber,
    restaurantId: order.restaurantId,
    branchId: order.branchId,
    tableId: order.tableId,
    tableNumber: order.tableNumber,
    status: order.status,
    source: order.source,
    orderType: order.orderType,
    totalInPaise: order.totalInPaise,
    items: order.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      totalPriceInPaise: item.totalPriceInPaise,
    })),
    createdAt: order.createdAt,
  })
}
