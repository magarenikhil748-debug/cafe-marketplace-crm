import type { ReservationStatus } from '@prisma/client'
import type { Server } from 'socket.io'

type ReservationEvent = {
  reservationId: string
  reference: string
  restaurantId: string
  status: ReservationStatus
  reservationDateTime: string
  partySize: number
  updatedAt: string
}

export const emitReservationCreated = (io: Server, payload: ReservationEvent) => {
  io.to(`restaurant:${payload.restaurantId}`).emit('reservation:created', payload)
}

export const emitReservationStatusUpdated = (io: Server, payload: ReservationEvent) => {
  io.to(`restaurant:${payload.restaurantId}`).emit('reservation:status_updated', payload)
}
