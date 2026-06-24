import { Prisma, type PrismaClient } from '@prisma/client'
import { AppError, ErrorCodes } from '../../common/errors/app-error'
import { buildCafeMenuUrl, createQrCodeDataUrl } from '../../common/utils/qr-code'

const publicCafeSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  address: true,
  city: true,
  phone: true,
  imageUrl: true,
  logoUrl: true,
  currency: true,
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

    return {
      ...cafe,
      menuUrl,
      qrCodeDataUrl: await createQrCodeDataUrl(menuUrl),
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
        restaurant: { isActive: true },
      },
      include: {
        restaurant: true,
        branch: true,
      },
    })

    if (!table) {
      throw new AppError(404, ErrorCodes.QR_INVALID, 'QR code is invalid or inactive')
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
      menuUrl: buildCafeMenuUrl(cafe.slug),
    }
  }
}
