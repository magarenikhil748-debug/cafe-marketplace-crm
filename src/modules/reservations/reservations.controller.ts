import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppError, ErrorCodes } from '../../common/errors/app-error'
import { sendSuccess } from '../../common/utils/api-response'
import { cafeSlugParamsSchema } from '../public/public.schema'
import { emitReservationCreated, emitReservationStatusUpdated } from './reservations.events'
import {
  createReservationOfferSchema,
  listReservationsQuerySchema,
  publicReservationSchema,
  reservationOfferParamsSchema,
  reservationParamsSchema,
  reservationRestaurantParamsSchema,
  updateReservationNoteSchema,
  updateReservationOfferSchema,
  updateReservationStatusSchema,
} from './reservations.schema'
import { ReservationsService } from './reservations.service'

const requireUserId = (request: FastifyRequest) => {
  if (!request.authUser) {
    throw new AppError(401, ErrorCodes.AUTH_UNAUTHORIZED, 'Authentication is required')
  }
  return request.authUser.id
}

export const createPublicReservation = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = cafeSlugParamsSchema.parse(request.params)
  const input = publicReservationSchema.parse(request.body)
  const service = new ReservationsService(request.server.prisma)
  const reservation = await service.createPublic(params.slug, input)

  emitReservationCreated(request.server.io, {
    reservationId: reservation.reservationId,
    reference: reservation.reference,
    restaurantId: reservation.restaurantId,
    status: reservation.status,
    reservationDateTime: reservation.reservationDateTime,
    partySize: reservation.partySize,
    updatedAt: reservation.updatedAt,
  })

  return sendSuccess(
    reply,
    'Your reservation request has been sent to the cafe. The cafe will confirm your table.',
    {
      reservation: {
        reservationId: reservation.reservationId,
        reference: reservation.reference,
        status: reservation.status,
        reservationDateTime: reservation.reservationDateTime,
        partySize: reservation.partySize,
      },
    },
    201,
  )
}

export const listReservations = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = reservationRestaurantParamsSchema.parse(request.params)
  const query = listReservationsQuerySchema.parse(request.query)
  const service = new ReservationsService(request.server.prisma)
  const result = await service.list(userId, params.restaurantId, query)

  return sendSuccess(reply, 'Reservations fetched successfully', result)
}

export const updateReservationStatus = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = reservationParamsSchema.parse(request.params)
  const input = updateReservationStatusSchema.parse(request.body)
  const service = new ReservationsService(request.server.prisma)
  const reservation = await service.updateStatus(
    userId,
    params.restaurantId,
    params.reservationId,
    input.status,
  )

  emitReservationStatusUpdated(request.server.io, {
    reservationId: reservation.id,
    reference: reservation.reference,
    restaurantId: params.restaurantId,
    status: reservation.status,
    reservationDateTime: reservation.reservationDateTime,
    partySize: reservation.partySize,
    updatedAt: reservation.updatedAt,
  })

  return sendSuccess(reply, 'Reservation status updated successfully', { reservation })
}

export const updateReservationNote = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = reservationParamsSchema.parse(request.params)
  const input = updateReservationNoteSchema.parse(request.body)
  const service = new ReservationsService(request.server.prisma)
  const reservation = await service.updateNote(
    userId,
    params.restaurantId,
    params.reservationId,
    input.ownerNote,
  )

  return sendSuccess(reply, 'Reservation note updated successfully', { reservation })
}

export const listReservationOffers = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = reservationRestaurantParamsSchema.parse(request.params)
  const service = new ReservationsService(request.server.prisma)
  const offers = await service.listOffers(userId, params.restaurantId)

  return sendSuccess(reply, 'Reservation offers fetched successfully', { offers })
}

export const createReservationOffer = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = reservationRestaurantParamsSchema.parse(request.params)
  const input = createReservationOfferSchema.parse(request.body)
  const service = new ReservationsService(request.server.prisma)
  const offer = await service.createOffer(userId, params.restaurantId, input)

  return sendSuccess(reply, 'Reservation offer created successfully', { offer }, 201)
}

export const updateReservationOffer = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = reservationOfferParamsSchema.parse(request.params)
  const input = updateReservationOfferSchema.parse(request.body)
  const service = new ReservationsService(request.server.prisma)
  const offer = await service.updateOffer(userId, params.restaurantId, params.offerId, input)

  return sendSuccess(reply, 'Reservation offer updated successfully', { offer })
}

export const deactivateReservationOffer = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = reservationOfferParamsSchema.parse(request.params)
  const service = new ReservationsService(request.server.prisma)
  const offer = await service.deactivateOffer(userId, params.restaurantId, params.offerId)

  return sendSuccess(reply, 'Reservation offer deactivated successfully', { offer })
}
