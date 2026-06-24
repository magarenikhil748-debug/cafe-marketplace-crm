import type { FastifyReply } from 'fastify'

type SuccessStatusCode = 200 | 201

export const sendSuccess = <T>(
  reply: FastifyReply,
  message: string,
  data: T,
  statusCode: SuccessStatusCode = 200,
) => reply.status(statusCode).send({ success: true, message, data } as never)


