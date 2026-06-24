import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { Prisma } from '@prisma/client'
import { ZodError } from 'zod'
import { env } from '../../config/env'
import { AppError, ErrorCodes } from './app-error'

export const errorHandler: Parameters<FastifyInstance['setErrorHandler']>[0] = (
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const normalizedError = error instanceof Error ? error : new Error('Unknown error')

  if (normalizedError instanceof AppError) {
    return reply.status(normalizedError.statusCode).send({
      success: false,
      message: normalizedError.message,
      code: normalizedError.code,
      details: normalizedError.details ?? {},
    })
  }

  if (normalizedError instanceof ZodError) {
    return reply.status(400).send({
      success: false,
      message: 'Request validation failed',
      code: ErrorCodes.VALIDATION_ERROR,
      details: normalizedError.flatten(),
    })
  }

  if (normalizedError instanceof Prisma.PrismaClientKnownRequestError) {
    if (normalizedError.code === 'P2002') {
      return reply.status(409).send({
        success: false,
        message: 'A record with the same unique value already exists',
        code: ErrorCodes.CONFLICT,
        details: { target: normalizedError.meta?.['target'] },
      })
    }

    if (normalizedError.code === 'P2025') {
      return reply.status(404).send({
        success: false,
        message: 'Requested record was not found',
        code: ErrorCodes.NOT_FOUND,
        details: {},
      })
    }
  }

  request.log.error({ err: normalizedError }, 'Unhandled API error')

  return reply.status(500).send({
    success: false,
    message: 'Something went wrong',
    code: ErrorCodes.INTERNAL_SERVER_ERROR,
    details:
      env.NODE_ENV === 'production'
        ? {}
        : { message: normalizedError.message, stack: normalizedError.stack },
  })
}


