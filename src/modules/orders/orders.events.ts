import type { Server } from 'socket.io'
import type { OrderSource, OrderStatus, OrderType } from '@prisma/client'

type CreatedOrderEvent = {
  orderId: string
  orderNumber: string
  restaurantId: string
  branchId: string
  tableId: string | null
  tableNumber: string | null
  status: OrderStatus
  source: OrderSource
  orderType: OrderType
  totalInPaise: number
  items: Array<{
    name: string
    quantity: number
    totalPriceInPaise: number
  }>
  createdAt: string
}

type StatusEvent = {
  orderId: string
  orderNumber: string
  restaurantId: string
  branchId: string
  oldStatus: OrderStatus
  newStatus: OrderStatus
  updatedAt: string
}

export const emitOrderCreated = (io: Server, payload: CreatedOrderEvent) => {
  io.to(`restaurant:${payload.restaurantId}`)
    .to(`branch:${payload.branchId}`)
    .emit('order:created', payload)
}

export const emitOrderStatusUpdated = (io: Server, payload: StatusEvent) => {
  io.to(`restaurant:${payload.restaurantId}`)
    .to(`branch:${payload.branchId}`)
    .to(`order:${payload.orderId}`)
    .emit('order:status_updated', payload)

  if (payload.newStatus === 'CANCELLED') {
    io.to(`restaurant:${payload.restaurantId}`)
      .to(`branch:${payload.branchId}`)
      .to(`order:${payload.orderId}`)
      .emit('order:cancelled', payload)
  }
}
