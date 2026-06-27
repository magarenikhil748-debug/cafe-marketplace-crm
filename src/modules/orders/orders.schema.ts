import { OrderStatus, OrderType } from '@prisma/client'
import { z } from 'zod'

export const restaurantParamsSchema = z.object({
  restaurantId: z.string().uuid(),
})

export const orderParamsSchema = z.object({
  orderId: z.string().uuid(),
})

export const listOrdersQuerySchema = z.object({
  status: z.nativeEnum(OrderStatus).optional(),
  branchId: z.string().uuid().optional(),
  tableId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export const orderItemInputSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().int().positive().max(20),
  addonIds: z.array(z.string().uuid()).max(20).default([]),
  instructions: z.string().trim().min(1).max(500).optional(),
})

export const createPublicOrderSchema = z.object({
  qrToken: z.string().trim().min(1).max(128),
  customerName: z.string().trim().min(1).max(120).optional(),
  customerPhone: z.string().trim().min(1).max(30).optional(),
  orderType: z.nativeEnum(OrderType).default('DINE_IN'),
  items: z.array(orderItemInputSchema).min(1).max(50),
  specialInstructions: z.string().trim().min(1).max(1000).optional(),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
})

export const updateOrderStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
})

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>
export type CreatePublicOrderInput = z.infer<typeof createPublicOrderSchema>
export type OrderItemInput = z.infer<typeof orderItemInputSchema>
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>
