import type { FastifyReply, FastifyRequest } from 'fastify'
import { sendSuccess } from '../../common/utils/api-response'
import { cafeSlugParamsSchema, earlyAccessLeadSchema, qrTokenParamsSchema } from './public.schema'
import { PublicService } from './public.service'

export const listCafes = async (request: FastifyRequest, reply: FastifyReply) => {
  const service = new PublicService(request.server.prisma)
  const cafes = await service.listCafes()

  return sendSuccess(reply, 'Cafes fetched successfully', { cafes })
}

export const createEarlyAccessLead = async (request: FastifyRequest, reply: FastifyReply) => {
  const input = earlyAccessLeadSchema.parse(request.body)
  const service = new PublicService(request.server.prisma)
  const lead = await service.createEarlyAccessLead(input)

  return sendSuccess(reply, 'Thanks — Tavero received your early access request.', { lead }, 201)
}

export const getCafe = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = cafeSlugParamsSchema.parse(request.params)
  const service = new PublicService(request.server.prisma)
  const cafe = await service.getCafe(params.slug)

  return sendSuccess(reply, 'Cafe fetched successfully', { cafe })
}

export const getCafeMenu = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = cafeSlugParamsSchema.parse(request.params)
  const service = new PublicService(request.server.prisma)
  const data = await service.getCafeMenu(params.slug)

  return sendSuccess(reply, 'Cafe menu fetched successfully', data)
}

export const listCafeTables = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = cafeSlugParamsSchema.parse(request.params)
  const service = new PublicService(request.server.prisma)
  const data = await service.listCafeTables(params.slug)

  return sendSuccess(reply, 'Cafe tables fetched successfully', data)
}

export const getQr = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = qrTokenParamsSchema.parse(request.params)
  const service = new PublicService(request.server.prisma)
  const data = await service.getQr(params.qrToken)

  return sendSuccess(reply, 'QR details fetched successfully', data)
}

export const getMenu = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = qrTokenParamsSchema.parse(request.params)
  const service = new PublicService(request.server.prisma)
  const data = await service.getMenu(params.qrToken)

  return sendSuccess(reply, 'Public menu fetched successfully', data)
}
