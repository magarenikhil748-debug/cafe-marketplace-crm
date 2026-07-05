import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../common/middleware/require-auth'
import { withSwagger } from '../../common/utils/route-schema'
import * as controller from './reservations.controller'

export const reservationsRoutes = async (fastify: FastifyInstance) => {
  fastify.get(
    '/restaurants/:restaurantId/reservations',
    {
      preHandler: [requireAuth],
      schema: withSwagger(
        ['Reservations'],
        'List cafe reservations',
        'Lists reservation requests for an authenticated cafe team member.',
        true,
      ),
    },
    controller.listReservations,
  )

  fastify.patch(
    '/restaurants/:restaurantId/reservations/:reservationId/status',
    {
      preHandler: [requireAuth],
      schema: withSwagger(
        ['Reservations'],
        'Update reservation status',
        'Moves a cafe reservation through the supported status workflow.',
        true,
      ),
    },
    controller.updateReservationStatus,
  )

  fastify.patch(
    '/restaurants/:restaurantId/reservations/:reservationId/note',
    {
      preHandler: [requireAuth],
      schema: withSwagger(
        ['Reservations'],
        'Update reservation note',
        'Updates the private cafe note for a reservation.',
        true,
      ),
    },
    controller.updateReservationNote,
  )

  fastify.get(
    '/restaurants/:restaurantId/reservation-offers',
    {
      preHandler: [requireAuth],
      schema: withSwagger(
        ['Reservations'],
        'List reservation offers',
        'Lists cafe-managed informational reservation offers.',
        true,
      ),
    },
    controller.listReservationOffers,
  )

  fastify.post(
    '/restaurants/:restaurantId/reservation-offers',
    {
      preHandler: [requireAuth],
      schema: withSwagger(
        ['Reservations'],
        'Create reservation offer',
        'Creates an owner-approved informational reservation offer.',
        true,
      ),
    },
    controller.createReservationOffer,
  )

  fastify.patch(
    '/restaurants/:restaurantId/reservation-offers/:offerId',
    {
      preHandler: [requireAuth],
      schema: withSwagger(
        ['Reservations'],
        'Update reservation offer',
        'Updates an owner-approved informational reservation offer.',
        true,
      ),
    },
    controller.updateReservationOffer,
  )

  fastify.delete(
    '/restaurants/:restaurantId/reservation-offers/:offerId',
    {
      preHandler: [requireAuth],
      schema: withSwagger(
        ['Reservations'],
        'Deactivate reservation offer',
        'Safely deactivates a reservation offer without deleting history.',
        true,
      ),
    },
    controller.deactivateReservationOffer,
  )
}
