export const ErrorCodes = {
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
  AUTH_FORBIDDEN: 'AUTH_FORBIDDEN',
  RESTAURANT_NOT_FOUND: 'RESTAURANT_NOT_FOUND',
  TABLE_NOT_FOUND: 'TABLE_NOT_FOUND',
  QR_INVALID: 'QR_INVALID',
  MENU_ITEM_UNAVAILABLE: 'MENU_ITEM_UNAVAILABLE',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  ORDER_INVALID_STATUS_TRANSITION: 'ORDER_INVALID_STATUS_TRANSITION',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

export class AppError extends Error {
  public readonly statusCode: number
  public readonly code: ErrorCode
  public readonly details?: unknown

  constructor(statusCode: number, code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}
