import type { PrismaClient } from '@prisma/client'
import { AppError, ErrorCodes } from '../../common/errors/app-error'
import { ensureRestaurantRole } from '../../common/middleware/require-role'
import { AuditService } from '../audit/audit.service'
import type {
  BulkCreateItemsInput,
  BulkUpdateItemImagesInput,
  CreateAddonGroupInput,
  CreateAddonInput,
  CreateCategoryInput,
  CreateItemInput,
  ListItemsQuery,
  UpdateAddonGroupInput,
  UpdateAddonInput,
  UpdateCategoryInput,
  UpdateItemInput,
} from './menu.schema'

export class MenuService {
  private readonly audit: AuditService

  constructor(private readonly prisma: PrismaClient) {
    this.audit = new AuditService(prisma)
  }

  async createCategory(userId: string, restaurantId: string, input: CreateCategoryInput) {
    await ensureRestaurantRole(this.prisma, userId, restaurantId, ['MANAGER'])
    await this.ensureBranchBelongsToRestaurant(restaurantId, input.branchId)

    return this.prisma.menuCategory.create({
      data: { restaurantId, ...input },
    })
  }

  async listCategories(userId: string, restaurantId: string) {
    await ensureRestaurantRole(this.prisma, userId, restaurantId, ['STAFF', 'MANAGER', 'KITCHEN'])

    return this.prisma.menuCategory.findMany({
      where: { restaurantId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        items: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    })
  }

  async updateCategory(userId: string, categoryId: string, input: UpdateCategoryInput) {
    const category = await this.getCategory(categoryId)
    await ensureRestaurantRole(this.prisma, userId, category.restaurantId, ['MANAGER'])
    await this.ensureBranchBelongsToRestaurant(category.restaurantId, input.branchId)

    return this.prisma.menuCategory.update({
      where: { id: categoryId },
      data: input,
    })
  }

  async updateCategoryImage(userId: string, categoryId: string, imageUrl: string | null) {
    const category = await this.getCategory(categoryId)
    await ensureRestaurantRole(this.prisma, userId, category.restaurantId, ['MANAGER', 'STAFF'])

    const updated = await this.prisma.menuCategory.update({
      where: { id: categoryId },
      data: { imageUrl },
    })

    await this.audit.log({
      restaurantId: updated.restaurantId,
      branchId: updated.branchId,
      userId,
      action: 'menu.category_image_updated',
      entityType: 'MenuCategory',
      entityId: updated.id,
      metadata: { hasImage: Boolean(imageUrl) },
    })

    return updated
  }

  async deleteCategory(userId: string, categoryId: string) {
    const category = await this.getCategory(categoryId)
    await ensureRestaurantRole(this.prisma, userId, category.restaurantId, ['MANAGER'])

    return this.prisma.menuCategory.update({
      where: { id: categoryId },
      data: { isActive: false },
    })
  }

  async createItem(userId: string, categoryId: string, input: CreateItemInput) {
    const category = await this.getCategory(categoryId)
    await ensureRestaurantRole(this.prisma, userId, category.restaurantId, ['MANAGER'])
    await this.ensureBranchBelongsToRestaurant(category.restaurantId, input.branchId)

    const item = await this.prisma.menuItem.create({
      data: {
        ...input,
        restaurantId: category.restaurantId,
        branchId: input.branchId ?? category.branchId,
        categoryId,
      },
      include: { addonGroups: { include: { addons: true } } },
    })

    await this.audit.log({
      restaurantId: item.restaurantId,
      branchId: item.branchId,
      userId,
      action: 'menu.item_created',
      entityType: 'MenuItem',
      entityId: item.id,
      metadata: { name: item.name, priceInPaise: item.priceInPaise },
    })

    return item
  }

  async createItemsBulk(userId: string, categoryId: string, input: BulkCreateItemsInput) {
    const category = await this.getCategory(categoryId)
    await ensureRestaurantRole(this.prisma, userId, category.restaurantId, ['MANAGER'])

    const branchIds = [...new Set(input.items.map((item) => item.branchId).filter(Boolean))]
    for (const branchId of branchIds) {
      await this.ensureBranchBelongsToRestaurant(category.restaurantId, branchId)
    }

    const items = await this.prisma.$transaction(
      input.items.map((item) =>
        this.prisma.menuItem.create({
          data: {
            ...item,
            restaurantId: category.restaurantId,
            branchId: item.branchId ?? category.branchId,
            categoryId,
          },
        }),
      ),
    )

    await this.audit.log({
      restaurantId: category.restaurantId,
      branchId: category.branchId,
      userId,
      action: 'menu.items_bulk_created',
      entityType: 'MenuItem',
      entityId: null,
      metadata: { count: items.length, categoryId },
    })

    return items
  }

  async listItems(userId: string, restaurantId: string, query: ListItemsQuery) {
    await ensureRestaurantRole(this.prisma, userId, restaurantId, ['STAFF', 'MANAGER', 'KITCHEN'])

    return this.prisma.menuItem.findMany({
      where: {
        restaurantId,
        isActive: true,
        branchId: query.branchId,
        categoryId: query.categoryId,
        isAvailable: query.includeUnavailable ? undefined : true,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        category: true,
        addonGroups: { include: { addons: true }, orderBy: { createdAt: 'asc' } },
      },
    })
  }

  async getItem(userId: string, itemId: string) {
    const item = await this.getActiveItem(itemId)
    await ensureRestaurantRole(this.prisma, userId, item.restaurantId, [
      'STAFF',
      'MANAGER',
      'KITCHEN',
    ])
    return item
  }

  async updateItem(userId: string, itemId: string, input: UpdateItemInput) {
    const existing = await this.getActiveItem(itemId)
    await ensureRestaurantRole(this.prisma, userId, existing.restaurantId, ['MANAGER'])
    await this.ensureBranchBelongsToRestaurant(existing.restaurantId, input.branchId)

    const item = await this.prisma.menuItem.update({
      where: { id: itemId },
      data: input,
      include: { addonGroups: { include: { addons: true } } },
    })

    await this.audit.log({
      restaurantId: item.restaurantId,
      branchId: item.branchId,
      userId,
      action: 'menu.item_updated',
      entityType: 'MenuItem',
      entityId: item.id,
      metadata: { changedFields: Object.keys(input) },
    })

    return item
  }

  async updateItemImage(userId: string, itemId: string, imageUrl: string | null) {
    const existing = await this.getActiveItem(itemId)
    await ensureRestaurantRole(this.prisma, userId, existing.restaurantId, ['MANAGER', 'STAFF'])

    const item = await this.prisma.menuItem.update({
      where: { id: itemId },
      data: { imageUrl },
    })

    await this.audit.log({
      restaurantId: item.restaurantId,
      branchId: item.branchId,
      userId,
      action: 'menu.item_image_updated',
      entityType: 'MenuItem',
      entityId: item.id,
      metadata: { hasImage: Boolean(imageUrl) },
    })

    return item
  }

  async bulkUpdateItemImages(
    userId: string,
    restaurantId: string,
    input: BulkUpdateItemImagesInput,
  ) {
    await ensureRestaurantRole(this.prisma, userId, restaurantId, ['MANAGER', 'STAFF'])
    const itemIds = input.items.map((item) => item.itemId)
    const ownedItems = await this.prisma.menuItem.findMany({
      where: { id: { in: itemIds }, restaurantId, isActive: true },
      select: { id: true },
    })

    if (ownedItems.length !== itemIds.length) {
      throw new AppError(
        403,
        ErrorCodes.AUTH_FORBIDDEN,
        'One or more menu items do not belong to this restaurant',
      )
    }

    return this.prisma.$transaction(async (tx) => {
      const items = await Promise.all(
        input.items.map((inputItem) =>
          tx.menuItem.update({
            where: { id: inputItem.itemId },
            data: { imageUrl: inputItem.imageUrl },
          }),
        ),
      )

      await tx.auditLog.create({
        data: {
          restaurantId,
          userId,
          action: 'menu.item_images_bulk_updated',
          entityType: 'MenuItem',
          metadata: { count: items.length },
        },
      })

      return items
    })
  }

  async deleteItem(userId: string, itemId: string) {
    const existing = await this.getActiveItem(itemId)
    await ensureRestaurantRole(this.prisma, userId, existing.restaurantId, ['MANAGER'])

    const item = await this.prisma.menuItem.update({
      where: { id: itemId },
      data: { isActive: false, isAvailable: false },
    })

    await this.audit.log({
      restaurantId: item.restaurantId,
      branchId: item.branchId,
      userId,
      action: 'menu.item_deleted',
      entityType: 'MenuItem',
      entityId: item.id,
      metadata: { name: item.name },
    })

    return item
  }

  async updateAvailability(userId: string, itemId: string, isAvailable: boolean) {
    const existing = await this.getActiveItem(itemId)
    await ensureRestaurantRole(this.prisma, userId, existing.restaurantId, ['MANAGER', 'KITCHEN'])

    const item = await this.prisma.menuItem.update({
      where: { id: itemId },
      data: { isAvailable },
    })

    await this.audit.log({
      restaurantId: item.restaurantId,
      branchId: item.branchId,
      userId,
      action: 'menu.item_availability_updated',
      entityType: 'MenuItem',
      entityId: item.id,
      metadata: { isAvailable },
    })

    return item
  }

  async createAddonGroup(userId: string, itemId: string, input: CreateAddonGroupInput) {
    const item = await this.getActiveItem(itemId)
    await ensureRestaurantRole(this.prisma, userId, item.restaurantId, ['MANAGER'])

    return this.prisma.menuItemAddonGroup.create({
      data: {
        restaurantId: item.restaurantId,
        menuItemId: itemId,
        ...input,
      },
      include: { addons: true },
    })
  }

  async updateAddonGroup(userId: string, addonGroupId: string, input: UpdateAddonGroupInput) {
    const group = await this.getAddonGroup(addonGroupId)
    await ensureRestaurantRole(this.prisma, userId, group.restaurantId, ['MANAGER'])

    return this.prisma.menuItemAddonGroup.update({
      where: { id: addonGroupId },
      data: input,
      include: { addons: true },
    })
  }

  async deleteAddonGroup(userId: string, addonGroupId: string) {
    const group = await this.getAddonGroup(addonGroupId)
    await ensureRestaurantRole(this.prisma, userId, group.restaurantId, ['MANAGER'])

    return this.prisma.menuItemAddonGroup.delete({ where: { id: addonGroupId } })
  }

  async createAddon(userId: string, addonGroupId: string, input: CreateAddonInput) {
    const group = await this.getAddonGroup(addonGroupId)
    await ensureRestaurantRole(this.prisma, userId, group.restaurantId, ['MANAGER'])

    return this.prisma.menuItemAddon.create({
      data: {
        addonGroupId,
        ...input,
      },
    })
  }

  async updateAddon(userId: string, addonId: string, input: UpdateAddonInput) {
    const addon = await this.getAddon(addonId)
    await ensureRestaurantRole(this.prisma, userId, addon.addonGroup.restaurantId, ['MANAGER'])

    return this.prisma.menuItemAddon.update({
      where: { id: addonId },
      data: input,
    })
  }

  async deleteAddon(userId: string, addonId: string) {
    const addon = await this.getAddon(addonId)
    await ensureRestaurantRole(this.prisma, userId, addon.addonGroup.restaurantId, ['MANAGER'])

    return this.prisma.menuItemAddon.update({
      where: { id: addonId },
      data: { isAvailable: false },
    })
  }

  private async ensureBranchBelongsToRestaurant(restaurantId: string, branchId?: string) {
    if (!branchId) {
      return
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, restaurantId, isActive: true },
    })
    if (!branch) {
      throw new AppError(404, ErrorCodes.NOT_FOUND, 'Branch was not found')
    }
  }

  private async getCategory(categoryId: string) {
    const category = await this.prisma.menuCategory.findFirst({
      where: { id: categoryId, isActive: true, restaurant: { isActive: true } },
    })
    if (!category) {
      throw new AppError(404, ErrorCodes.NOT_FOUND, 'Menu category was not found')
    }
    return category
  }

  private async getActiveItem(itemId: string) {
    const item = await this.prisma.menuItem.findFirst({
      where: { id: itemId, isActive: true, restaurant: { isActive: true } },
      include: {
        category: true,
        addonGroups: { include: { addons: true }, orderBy: { createdAt: 'asc' } },
      },
    })
    if (!item) {
      throw new AppError(404, ErrorCodes.NOT_FOUND, 'Menu item was not found')
    }
    return item
  }

  private async getAddonGroup(addonGroupId: string) {
    const group = await this.prisma.menuItemAddonGroup.findUnique({
      where: { id: addonGroupId },
      include: { menuItem: true },
    })
    if (!group || !group.menuItem.isActive) {
      throw new AppError(404, ErrorCodes.NOT_FOUND, 'Addon group was not found')
    }
    return group
  }

  private async getAddon(addonId: string) {
    const addon = await this.prisma.menuItemAddon.findUnique({
      where: { id: addonId },
      include: { addonGroup: true },
    })
    if (!addon) {
      throw new AppError(404, ErrorCodes.NOT_FOUND, 'Addon was not found')
    }
    return addon
  }
}
