import type { Server } from 'socket.io'
import type { OrderStatus } from '@prisma/client'

type CreatedOrderEvent = {
  orderId: string
  orderNumber: string
  restaurantId: string
  branchId: string
  tableId: string
  tableNumber: string
  status: OrderStatus
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


