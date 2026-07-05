import { Prisma, type PrismaClient, type ReservationStatus } from '@prisma/client'
import { AppError, ErrorCodes } from '../../common/errors/app-error'
import { ensureRestaurantRole } from '../../common/middleware/require-role'
import { buildPaginationMeta, getPagination } from '../../common/utils/pagination'
import { AuditService } from '../audit/audit.service'
import type {
  CreateReservationOfferInput,
  ListReservationsQuery,
  PublicReservationInput,
  UpdateReservationOfferInput,
} from './reservations.schema'

const reservationInclude = {
  offer: {
    select: { id: true, title: true, description: true, terms: true },
  },
} satisfies Prisma.ReservationInclude

type ReservationWithOffer = Prisma.ReservationGetPayload<{ include: typeof reservationInclude }>

const reservationTransitions: Record<ReservationStatus, ReservationStatus[]> = {
  REQUESTED: ['CONFIRMED', 'DECLINED', 'CANCELLED'],
  CONFIRMED: ['SEATED', 'CANCELLED', 'NO_SHOW'],
  DECLINED: [],
  CANCELLED: [],
  SEATED: [],
  NO_SHOW: [],
}

const reservationReference = (id: string) => `RSV-${id.slice(0, 8).toUpperCase()}`

export class ReservationsService {
  private readonly audit: AuditService

  constructor(private readonly prisma: PrismaClient) {
    this.audit = new AuditService(prisma)
  }

  async createPublic(slug: string, input: PublicReservationInput, now = new Date()) {
    const cafe = await this.prisma.restaurant.findFirst({
      where: { slug, isActive: true, isApproved: true },
      select: { id: true },
    })
    if (!cafe) {
      throw new AppError(404, ErrorCodes.RESTAURANT_NOT_FOUND, 'Cafe was not found')
    }

    const reservationDateTime = new Date(input.reservationDateTime)
    if (reservationDateTime <= now) {
      throw new AppError(
        400,
        ErrorCodes.VALIDATION_ERROR,
        'Reservation date and time must be in the future',
      )
    }

    let offerId: string | undefined
    if (input.offerId) {
      const offer = await this.prisma.reservationOffer.findFirst({
        where: {
          id: input.offerId,
          restaurantId: cafe.id,
          isActive: true,
          AND: [
            { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
            { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
          ],
        },
      })
      if (!offer) {
        throw new AppError(
          400,
          ErrorCodes.RESERVATION_OFFER_NOT_FOUND,
          'Selected reservation offer is unavailable',
        )
      }
      if (offer.minGuests && input.partySize < offer.minGuests) {
        throw new AppError(
          400,
          ErrorCodes.VALIDATION_ERROR,
          `This offer requires at least ${offer.minGuests} guests`,
        )
      }
      offerId = offer.id
    }

    const reservation = await this.prisma.reservation.create({
      data: {
        restaurantId: cafe.id,
        offerId,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail,
        partySize: input.partySize,
        reservationDateTime,
        occasion: input.occasion,
        specialRequest: input.specialRequest,
        source: 'PUBLIC_PROFILE',
      },
      select: {
        id: true,
        restaurantId: true,
        status: true,
        reservationDateTime: true,
        partySize: true,
        updatedAt: true,
      },
    })

    return {
      reservationId: reservation.id,
      reference: reservationReference(reservation.id),
      status: reservation.status,
      reservationDateTime: reservation.reservationDateTime.toISOString(),
      partySize: reservation.partySize,
      restaurantId: reservation.restaurantId,
      updatedAt: reservation.updatedAt.toISOString(),
    }
  }

  async list(userId: string, restaurantId: string, query: ListReservationsQuery) {
    await ensureRestaurantRole(this.prisma, userId, restaurantId, ['MANAGER', 'STAFF'])
    const pagination = getPagination(query)
    const reservationDateTime: Prisma.DateTimeFilter = {}
    if (query.dateFrom) reservationDateTime.gte = new Date(query.dateFrom)
    if (query.dateTo) reservationDateTime.lte = new Date(query.dateTo)
    const where: Prisma.ReservationWhereInput = {
      restaurantId,
      status: query.status,
      reservationDateTime:
        Object.keys(reservationDateTime).length > 0 ? reservationDateTime : undefined,
    }

    const [total, reservations] = await this.prisma.$transaction([
      this.prisma.reservation.count({ where }),
      this.prisma.reservation.findMany({
        where,
        include: reservationInclude,
        orderBy: [{ reservationDateTime: 'asc' }, { createdAt: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
    ])

    return {
      reservations: reservations.map((reservation) => this.serializeReservation(reservation)),
      pagination: buildPaginationMeta(total, pagination.page, pagination.limit),
    }
  }

  async updateStatus(
    userId: string,
    restaurantId: string,
    reservationId: string,
    nextStatus: ReservationStatus,
  ) {
    await ensureRestaurantRole(this.prisma, userId, restaurantId, ['MANAGER', 'STAFF'])
    const existing = await this.getRestaurantReservation(restaurantId, reservationId)
    if (!reservationTransitions[existing.status].includes(nextStatus)) {
      throw new AppError(
        400,
        ErrorCodes.RESERVATION_INVALID_STATUS_TRANSITION,
        `Reservation cannot move from ${existing.status} to ${nextStatus}`,
      )
    }

    const now = new Date()
    const timestamp =
      nextStatus === 'CONFIRMED'
        ? { confirmedAt: now }
        : nextStatus === 'CANCELLED'
          ? { cancelledAt: now }
          : nextStatus === 'DECLINED'
            ? { declinedAt: now }
            : nextStatus === 'SEATED'
              ? { seatedAt: now }
              : nextStatus === 'NO_SHOW'
                ? { noShowAt: now }
                : {}
    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: nextStatus, ...timestamp },
      include: reservationInclude,
    })
    await this.audit.log({
      restaurantId,
      userId,
      action: 'reservation.status_updated',
      entityType: 'Reservation',
      entityId: reservationId,
      metadata: { oldStatus: existing.status, newStatus: nextStatus },
    })
    return this.serializeReservation(updated)
  }

  async updateNote(
    userId: string,
    restaurantId: string,
    reservationId: string,
    ownerNote: string | null,
  ) {
    await ensureRestaurantRole(this.prisma, userId, restaurantId, ['MANAGER', 'STAFF'])
    await this.getRestaurantReservation(restaurantId, reservationId)
    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: { ownerNote },
      include: reservationInclude,
    })
    return this.serializeReservation(updated)
  }

  async listOffers(userId: string, restaurantId: string) {
    await ensureRestaurantRole(this.prisma, userId, restaurantId, ['MANAGER', 'STAFF'])
    return this.prisma.reservationOffer.findMany({
      where: { restaurantId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    })
  }

  async createOffer(userId: string, restaurantId: string, input: CreateReservationOfferInput) {
    await ensureRestaurantRole(this.prisma, userId, restaurantId, ['MANAGER'])
    const offer = await this.prisma.reservationOffer.create({
      data: {
        restaurantId,
        ...input,
        validFrom: input.validFrom ? new Date(input.validFrom) : undefined,
        validUntil: input.validUntil ? new Date(input.validUntil) : undefined,
      },
    })
    await this.audit.log({
      restaurantId,
      userId,
      action: 'reservation.offer_created',
      entityType: 'ReservationOffer',
      entityId: offer.id,
      metadata: { title: offer.title },
    })
    return offer
  }

  async updateOffer(
    userId: string,
    restaurantId: string,
    offerId: string,
    input: UpdateReservationOfferInput,
  ) {
    await ensureRestaurantRole(this.prisma, userId, restaurantId, ['MANAGER'])
    const existing = await this.getRestaurantOffer(restaurantId, offerId)
    const validFrom =
      input.validFrom === undefined
        ? existing.validFrom
        : input.validFrom
          ? new Date(input.validFrom)
          : null
    const validUntil =
      input.validUntil === undefined
        ? existing.validUntil
        : input.validUntil
          ? new Date(input.validUntil)
          : null
    if (validFrom && validUntil && validFrom >= validUntil) {
      throw new AppError(
        400,
        ErrorCodes.VALIDATION_ERROR,
        'Offer end date must be after its start date',
      )
    }
    return this.prisma.reservationOffer.update({
      where: { id: offerId },
      data: {
        ...input,
        validFrom:
          input.validFrom === undefined
            ? undefined
            : input.validFrom
              ? new Date(input.validFrom)
              : null,
        validUntil:
          input.validUntil === undefined
            ? undefined
            : input.validUntil
              ? new Date(input.validUntil)
              : null,
      },
    })
  }

  async deactivateOffer(userId: string, restaurantId: string, offerId: string) {
    await ensureRestaurantRole(this.prisma, userId, restaurantId, ['MANAGER'])
    await this.getRestaurantOffer(restaurantId, offerId)
    return this.prisma.reservationOffer.update({
      where: { id: offerId },
      data: { isActive: false },
    })
  }

  private async getRestaurantReservation(restaurantId: string, reservationId: string) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { id: reservationId, restaurantId },
    })
    if (!reservation) {
      throw new AppError(404, ErrorCodes.RESERVATION_NOT_FOUND, 'Reservation was not found')
    }
    return reservation
  }

  private async getRestaurantOffer(restaurantId: string, offerId: string) {
    const offer = await this.prisma.reservationOffer.findFirst({
      where: { id: offerId, restaurantId },
    })
    if (!offer) {
      throw new AppError(
        404,
        ErrorCodes.RESERVATION_OFFER_NOT_FOUND,
        'Reservation offer was not found',
      )
    }
    return offer
  }

  private serializeReservation(reservation: ReservationWithOffer) {
    return {
      id: reservation.id,
      reference: reservationReference(reservation.id),
      customerName: reservation.customerName,
      customerPhone: reservation.customerPhone,
      customerEmail: reservation.customerEmail,
      partySize: reservation.partySize,
      reservationDateTime: reservation.reservationDateTime.toISOString(),
      occasion: reservation.occasion,
      specialRequest: reservation.specialRequest,
      ownerNote: reservation.ownerNote,
      status: reservation.status,
      source: reservation.source,
      offer: reservation.offer,
      createdAt: reservation.createdAt.toISOString(),
      updatedAt: reservation.updatedAt.toISOString(),
    }
  }
}
