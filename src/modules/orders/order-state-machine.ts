import { OrderStatus } from '@prisma/client'
import { AppError, ErrorCodes } from '../../common/errors/app-error'

const transitions: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY'],
  READY: ['SERVED'],
  SERVED: [],
  CANCELLED: [],
}

export const assertOrderStatusTransition = (
  currentStatus: OrderStatus,
  nextStatus: OrderStatus,
) => {
  if (!transitions[currentStatus].includes(nextStatus)) {
    throw new AppError(
      400,
      ErrorCodes.ORDER_INVALID_STATUS_TRANSITION,
      `Cannot transition order from ${currentStatus} to ${nextStatus}`,
      { currentStatus, nextStatus, allowed: transitions[currentStatus] },
    )
  }
}

export const statusTimestampField = (status: OrderStatus) => {
  const fields: Partial<
    Record<OrderStatus, 'acceptedAt' | 'preparingAt' | 'readyAt' | 'servedAt' | 'cancelledAt'>
  > = {
    ACCEPTED: 'acceptedAt',
    PREPARING: 'preparingAt',
    READY: 'readyAt',
    SERVED: 'servedAt',
    CANCELLED: 'cancelledAt',
  }

  return fields[status]
}


