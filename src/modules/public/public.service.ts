import { Prisma, type PrismaClient } from '@prisma/client'
import { AppError, ErrorCodes } from '../../common/errors/app-error'
import { buildCafeMenuUrl, createQrCodeDataUrl } from '../../common/utils/qr-code'
import type { EarlyAccessLeadInput } from './public.schema'

const publicCafeSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  address: true,
  city: true,
  phone: true,
  imageUrl: true,
  galleryImages: true,
  logoUrl: true,
  currency: true,
  businessType: true,
} satisfies Prisma.RestaurantSelect

const marketplaceMenuInclude = {
  items: {
    where: {
      isActive: true,
      isAvailable: true,
      OR: [{ branchId: null }, { branch: { isActive: true } }],
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      addonGroups: {
        orderBy: { createdAt: 'asc' },
        include: {
          addons: {
            where: { isAvailable: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
  },
} satisfies Prisma.MenuCategoryInclude

type MarketplaceMenuCategory = Prisma.MenuCategoryGetPayload<{
  include: typeof marketplaceMenuInclude
}>

type PublicCafe = Prisma.RestaurantGetPayload<{ select: typeof publicCafeSelect }>

export class PublicService {
  constructor(private readonly prisma: PrismaClient) {}

  async createEarlyAccessLead(input: EarlyAccessLeadInput) {
    return this.prisma.earlyAccessLead.create({
      data: {
        ...input,
        source: 'website',
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
      },
    })
  }

  async listCafes() {
    const cafes = await this.prisma.restaurant.findMany({
      where: {
        isActive: true,
        isApproved: true,
      },
      select: publicCafeSelect,
      orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
    })

    return cafes.map((cafe) => this.withCafeMenuUrl(cafe))
  }

  async getCafe(slug: string) {
    const cafe = await this.findApprovedCafe(slug)
    const menuUrl = buildCafeMenuUrl(cafe.slug)
    const now = new Date()
    const reservationOffers = await this.prisma.reservationOffer.findMany({
      where: {
        restaurantId: cafe.id,
        isActive: true,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
        ],
      },
      select: {
        id: true,
        title: true,
        description: true,
        terms: true,
        minGuests: true,
        validFrom: true,
        validUntil: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return {
      ...cafe,
      menuUrl,
      qrCodeDataUrl: await createQrCodeDataUrl(menuUrl),
      reservationOffers: reservationOffers.map((offer) => ({
        ...offer,
        validFrom: offer.validFrom?.toISOString() ?? null,
        validUntil: offer.validUntil?.toISOString() ?? null,
      })),
    }
  }

  async getCafeMenu(slug: string) {
    const cafe = await this.findApprovedCafe(slug)
    const categories = await this.prisma.menuCategory.findMany({
      where: {
        restaurantId: cafe.id,
        isActive: true,
        OR: [{ branchId: null }, { branch: { isActive: true } }],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: marketplaceMenuInclude,
    })

    return {
      cafe: this.withCafeMenuUrl(cafe),
      categories: this.serializeMarketplaceMenu(categories),
    }
  }

  async listCafeTables(slug: string) {
    const cafe = await this.findApprovedCafe(slug)
    const tables = await this.prisma.diningTable.findMany({
      where: {
        restaurantId: cafe.id,
        isActive: true,
        branch: { isActive: true },
      },
      select: {
        id: true,
        tableNumber: true,
        tableLabel: true,
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ branch: { name: 'asc' } }, { tableNumber: 'asc' }],
    })

    return {
      cafe: this.withCafeMenuUrl(cafe),
      tables,
    }
  }

  async getQr(qrToken: string) {
    const table = await this.findTableByQrToken(qrToken)

    return {
      restaurant: {
        id: table.restaurant.id,
        name: table.restaurant.name,
        slug: table.restaurant.slug,
        phone: table.restaurant.phone,
        email: table.restaurant.email,
        address: table.restaurant.address,
        city: table.restaurant.city,
        currency: table.restaurant.currency,
        taxEnabled: table.restaurant.taxEnabled,
        logoUrl: table.restaurant.logoUrl,
      },
      branch: {
        id: table.branch.id,
        name: table.branch.name,
        address: table.branch.address,
        phone: table.branch.phone,
      },
      table: {
        id: table.id,
        tableNumber: table.tableNumber,
        tableLabel: table.tableLabel,
        qrUrl: table.qrUrl,
      },
    }
  }

  async getMenu(qrToken: string) {
    const table = await this.findTableByQrToken(qrToken)
    const categories = await this.prisma.menuCategory.findMany({
      where: {
        restaurantId: table.restaurantId,
        isActive: true,
        OR: [{ branchId: null }, { branchId: table.branchId }],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        items: {
          where: {
            isActive: true,
            isAvailable: true,
            OR: [{ branchId: null }, { branchId: table.branchId }],
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: {
            addonGroups: {
              orderBy: { createdAt: 'asc' },
              include: {
                addons: {
                  where: { isAvailable: true },
                  orderBy: { createdAt: 'asc' },
                },
              },
            },
          },
        },
      },
    })

    return {
      restaurant: {
        id: table.restaurant.id,
        name: table.restaurant.name,
        currency: table.restaurant.currency,
        taxEnabled: table.restaurant.taxEnabled,
      },
      branch: {
        id: table.branch.id,
        name: table.branch.name,
      },
      table: {
        id: table.id,
        tableNumber: table.tableNumber,
        tableLabel: table.tableLabel,
      },
      categories: categories
        .map((category) => ({
          id: category.id,
          name: category.name,
          description: category.description,
          imageUrl: category.imageUrl,
          sortOrder: category.sortOrder,
          items: category.items.map((item) => ({
            id: item.id,
            name: item.name,
            description: item.description,
            priceInPaise: item.priceInPaise,
            imageUrl: item.imageUrl,
            foodType: item.foodType,
            isRecommended: item.isRecommended,
            preparationTimeMinutes: item.preparationTimeMinutes,
            sortOrder: item.sortOrder,
            addonGroups: item.addonGroups.map((group) => ({
              id: group.id,
              name: group.name,
              minSelect: group.minSelect,
              maxSelect: group.maxSelect,
              isRequired: group.isRequired,
              addons: group.addons.map((addon) => ({
                id: addon.id,
                name: addon.name,
                priceInPaise: addon.priceInPaise,
              })),
            })),
          })),
        }))
        .filter((category) => category.items.length > 0),
    }
  }

  private async findTableByQrToken(qrToken: string) {
    const table = await this.prisma.diningTable.findFirst({
      where: {
        qrToken,
        isActive: true,
        branch: { isActive: true },
        restaurant: { isActive: true, isApproved: true },
      },
      include: {
        restaurant: true,
        branch: true,
      },
    })

    if (!table) {
      throw new AppError(
        404,
        ErrorCodes.QR_INVALID,
        'This ordering link is invalid or expired. Please scan the QR code on your table again.',
      )
    }

    return table
  }

  private async findApprovedCafe(slug: string) {
    const cafe = await this.prisma.restaurant.findFirst({
      where: {
        slug,
        isActive: true,
        isApproved: true,
      },
      select: publicCafeSelect,
    })

    if (!cafe) {
      throw new AppError(404, ErrorCodes.RESTAURANT_NOT_FOUND, 'Cafe was not found')
    }

    return cafe
  }

  private serializeMarketplaceMenu(categories: MarketplaceMenuCategory[]) {
    return categories
      .map((category) => ({
        id: category.id,
        branchId: category.branchId,
        name: category.name,
        description: category.description,
        imageUrl: category.imageUrl,
        sortOrder: category.sortOrder,
        items: category.items.map((item) => ({
          id: item.id,
          branchId: item.branchId,
          name: item.name,
          description: item.description,
          priceInPaise: item.priceInPaise,
          imageUrl: item.imageUrl,
          foodType: item.foodType,
          isRecommended: item.isRecommended,
          preparationTimeMinutes: item.preparationTimeMinutes,
          sortOrder: item.sortOrder,
          addonGroups: item.addonGroups.map((group) => ({
            id: group.id,
            name: group.name,
            minSelect: group.minSelect,
            maxSelect: group.maxSelect,
            isRequired: group.isRequired,
            addons: group.addons.map((addon) => ({
              id: addon.id,
              name: addon.name,
              priceInPaise: addon.priceInPaise,
            })),
          })),
        })),
      }))
      .filter((category) => category.items.length > 0)
  }

  private withCafeMenuUrl(cafe: PublicCafe) {
    return {
      ...cafe,
      galleryImages: this.serializeGalleryImages(cafe.galleryImages),
      menuUrl: buildCafeMenuUrl(cafe.slug),
    }
  }

  private serializeGalleryImages(value: Prisma.JsonValue) {
    if (!Array.isArray(value)) return []

    return value
      .filter(
        (image): image is Prisma.JsonObject =>
          typeof image === 'object' && image !== null && !Array.isArray(image),
      )
      .map((image, index) => ({
        url: typeof image['url'] === 'string' ? image['url'] : '',
        type: typeof image['type'] === 'string' ? image['type'] : 'OTHER',
        sortOrder: typeof image['sortOrder'] === 'number' ? image['sortOrder'] : index,
      }))
      .filter((image) => /^https?:\/\//i.test(image.url))
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .slice(0, 15)
  }
}
