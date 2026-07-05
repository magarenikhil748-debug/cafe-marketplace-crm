import { ReservationStatus } from '@prisma/client'
import { z } from 'zod'

export const reservationRestaurantParamsSchema = z.object({
  restaurantId: z.string().uuid(),
})

export const reservationParamsSchema = reservationRestaurantParamsSchema.extend({
  reservationId: z.string().uuid(),
})

export const reservationOfferParamsSchema = reservationRestaurantParamsSchema.extend({
  offerId: z.string().uuid(),
})

export const publicReservationSchema = z.object({
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z
    .string()
    .trim()
    .min(7)
    .max(30)
    .regex(/^[+0-9()\-\s]+$/, 'Enter a valid phone number'),
  customerEmail: z.string().trim().email().max(254).optional(),
  partySize: z.number().int().min(1).max(20),
  reservationDateTime: z.string().datetime({ offset: true }),
  occasion: z.string().trim().min(1).max(100).optional(),
  specialRequest: z.string().trim().min(1).max(1000).optional(),
  offerId: z.string().uuid().optional(),
})

export const listReservationsQuerySchema = z.object({
  status: z.nativeEnum(ReservationStatus).optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
})

export const updateReservationStatusSchema = z.object({
  status: z.nativeEnum(ReservationStatus),
})

export const updateReservationNoteSchema = z.object({
  ownerNote: z.string().trim().min(1).max(1000).nullable(),
})

const offerFields = {
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().min(2).max(500),
  terms: z.string().trim().min(1).max(1000).optional(),
  minGuests: z.number().int().min(1).max(20).optional(),
  validFrom: z.string().datetime({ offset: true }).optional(),
  validUntil: z.string().datetime({ offset: true }).optional(),
  isActive: z.boolean().default(true),
}

const validateOfferRange = (
  input: { validFrom?: string | null; validUntil?: string | null },
  context: z.RefinementCtx,
) => {
  if (
    input.validFrom &&
    input.validUntil &&
    new Date(input.validFrom) >= new Date(input.validUntil)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['validUntil'],
      message: 'Offer end date must be after its start date',
    })
  }
}

export const createReservationOfferSchema = z.object(offerFields).superRefine(validateOfferRange)

export const updateReservationOfferSchema = z
  .object({
    title: offerFields.title.optional(),
    description: offerFields.description.optional(),
    terms: z.string().trim().min(1).max(1000).nullable().optional(),
    minGuests: z.number().int().min(1).max(20).nullable().optional(),
    validFrom: z.string().datetime({ offset: true }).nullable().optional(),
    validUntil: z.string().datetime({ offset: true }).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine(validateOfferRange)

export type PublicReservationInput = z.infer<typeof publicReservationSchema>
export type ListReservationsQuery = z.infer<typeof listReservationsQuerySchema>
export type CreateReservationOfferInput = z.infer<typeof createReservationOfferSchema>
export type UpdateReservationOfferInput = z.infer<typeof updateReservationOfferSchema>
