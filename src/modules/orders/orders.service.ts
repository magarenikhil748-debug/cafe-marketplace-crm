import { Prisma, type OrderStatus, type PrismaClient } from '@prisma/client'
import { AppError, ErrorCodes } from '../../common/errors/app-error'
import { ensureRestaurantRole } from '../../common/middleware/require-role'
import { buildPaginationMeta, getPagination } from '../../common/utils/pagination'
import { calculateTaxInPaise } from '../../common/utils/money'
import { createRequestHash } from '../../common/utils/idempotency'
import { AuditService } from '../audit/audit.service'
import type { CafeTableOrderInput } from '../public/public.schema'
import { assertOrderStatusTransition, statusTimestampField } from './order-state-machine'
import type {
  CreateManualOrderInput,
  CreatePublicOrderInput,
  ListOrdersQuery,
  OrderItemInput,
} from './orders.schema'

type PreparedOrderItem = {
  menuItemId: string
  itemNameSnapshot: string
  unitPriceInPaise: number
  quantity: number
  totalPriceInPaise: number
  instructions?: string
  addons: Array<{
    addonNameSnapshot: string
    addonPriceInPaise: number
  }>
}

const orderInclude = {
  table: true,
  branch: true,
  items: {
    include: {
      addons: true,
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.OrderInclude

type OrderWithDetails = Prisma.OrderGetPayload<{ include: typeof orderInclude }>

const orderTableInclude = {
  restaurant: true,
  branch: true,
} satisfies Prisma.DiningTableInclude

type OrderTable = Prisma.DiningTableGetPayload<{ include: typeof orderTableInclude }>
type ResolvedOrderInput = Omit<CreatePublicOrderInput, 'qrToken'>

export class OrdersService {
  private readonly audit: AuditService

  constructor(private readonly prisma: PrismaClient) {
    this.audit = new AuditService(prisma)
  }

  async createPublicOrder(input: CreatePublicOrderInput) {
    const table = await this.prisma.diningTable.findFirst({
      where: {
        qrToken: input.qrToken,
        isActive: true,
        branch: { isActive: true },
        restaurant: { isActive: true, isApproved: true },
      },
      include: orderTableInclude,
    })

    if (!table) {
      throw new AppError(
        403,
        ErrorCodes.INVALID_TABLE_QR,
        'This ordering link is invalid or expired. Please scan the QR code on your table again.',
      )
    }

    return this.createOrderForTable(
      table,
      {
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        orderType: input.orderType,
        items: input.items,
        specialInstructions: input.specialInstructions,
        idempotencyKey: input.idempotencyKey,
      },
      { source: 'qr', ...input, idempotencyKey: undefined },
    )
  }

  async createCafeOrder(slug: string, input: CafeTableOrderInput) {
    const cafe = await this.prisma.restaurant.findFirst({
      where: {
        slug,
        isActive: true,
        isApproved: true,
      },
      select: { id: true },
    })

    if (!cafe) {
      throw new AppError(404, ErrorCodes.RESTAURANT_NOT_FOUND, 'Cafe was not found')
    }

    const table = await this.prisma.diningTable.findFirst({
      where: {
        restaurantId: cafe.id,
        qrToken: input.qrToken,
        isActive: true,
        branch: { isActive: true },
        restaurant: { isActive: true, isApproved: true },
      },
      include: orderTableInclude,
    })

    if (!table) {
      throw new AppError(
        403,
        ErrorCodes.INVALID_TABLE_QR,
        'This ordering link is invalid or expired. Please scan the QR code on your table again.',
      )
    }

    return this.createOrderForTable(
      table,
      {
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        orderType: 'DINE_IN',
        items: input.items.map((item) => ({
          ...item,
          addonIds: [],
        })),
        specialInstructions: input.specialInstruction,
        idempotencyKey: input.idempotencyKey,
      },
      { source: 'cafe-qr', slug, ...input, idempotencyKey: undefined },
    )
  }

  private async createOrderForTable(
    table: OrderTable,
    input: ResolvedOrderInput,
    requestPayload: unknown,
  ) {
    const requestHash = createRequestHash(requestPayload)
    const idempotencyKey = input.idempotencyKey

    if (idempotencyKey) {
      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { restaurantId_key: { restaurantId: table.restaurantId, key: idempotencyKey } },
      })

      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new AppError(
            409,
            ErrorCodes.IDEMPOTENCY_CONFLICT,
            'Idempotency key was already used with a different request',
          )
        }

        return { order: existing.responseBody, wasIdempotent: true }
      }
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          if (idempotencyKey) {
            const existing = await tx.idempotencyKey.findUnique({
              where: {
                restaurantId_key: { restaurantId: table.restaurantId, key: idempotencyKey },
              },
            })

            if (existing) {
              if (existing.requestHash !== requestHash) {
                throw new AppError(
                  409,
                  ErrorCodes.IDEMPOTENCY_CONFLICT,
                  'Idempotency key was already used with a different request',
                )
              }
              return { order: existing.responseBody, wasIdempotent: true }
            }
          }

          const preparedItems = await this.prepareOrderItems(
            tx,
            table.restaurantId,
            table.branchId,
            input.items,
          )
          const subtotalInPaise = preparedItems.reduce(
            (sum, item) => sum + item.totalPriceInPaise,
            0,
          )
          const taxInPaise = calculateTaxInPaise(subtotalInPaise, table.restaurant.taxEnabled)
          const totalInPaise = subtotalInPaise + taxInPaise
          const counter = await tx.restaurantOrderSequence.upsert({
            where: { restaurantId: table.restaurantId },
            create: { restaurantId: table.restaurantId, nextNumber: 2 },
            update: { nextNumber: { increment: 1 } },
          })
          const sequenceNumber = counter.nextNumber - 1
          const orderNumber = `ORD-${String(sequenceNumber).padStart(4, '0')}`

          const order = await tx.order.create({
            data: {
              restaurantId: table.restaurantId,
              branchId: table.branchId,
              tableId: table.id,
              tableNumberSnapshot: table.tableNumber,
              orderNumber,
              customerName: input.customerName,
              customerPhone: input.customerPhone,
              orderType: input.orderType,
              source: 'QR',
              subtotalInPaise,
              taxInPaise,
              totalInPaise,
              specialInstructions: input.specialInstructions,
              idempotencyKey,
              items: {
                create: preparedItems.map((item) => ({
                  menuItem: { connect: { id: item.menuItemId } },
                  itemNameSnapshot: item.itemNameSnapshot,
                  unitPriceInPaise: item.unitPriceInPaise,
                  quantity: item.quantity,
                  totalPriceInPaise: item.totalPriceInPaise,
                  instructions: item.instructions,
                  addons: {
                    create: item.addons,
                  },
                })),
              },
            },
            include: orderInclude,
          })

          const serialized = this.serializeOrder(order)

          if (idempotencyKey) {
            await tx.idempotencyKey.create({
              data: {
                key: idempotencyKey,
                restaurantId: table.restaurantId,
                requestHash,
                responseBody: serialized as Prisma.InputJsonValue,
              },
            })
          }

          return { order: serialized, wasIdempotent: false }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        idempotencyKey
      ) {
        const existing = await this.prisma.idempotencyKey.findUnique({
          where: { restaurantId_key: { restaurantId: table.restaurantId, key: idempotencyKey } },
        })
        if (existing?.requestHash === requestHash) {
          return { order: existing.responseBody, wasIdempotent: true }
        }
      }
      throw error
    }
  }

  async createManualOrder(userId: string, restaurantId: string, input: CreateManualOrderInput) {
    const membership = await ensureRestaurantRole(this.prisma, userId, restaurantId, [
      'MANAGER',
      'STAFF',
    ])

    let table: OrderTable | null = null
    let branchId: string
    let taxEnabled: boolean

    if (input.orderType === 'DINE_IN') {
      table = await this.prisma.diningTable.findFirst({
        where: {
          id: input.tableId,
          restaurantId,
          isActive: true,
          branch: { isActive: true },
          restaurant: { isActive: true },
        },
        include: orderTableInclude,
      })

      if (!table) {
        throw new AppError(
          400,
          ErrorCodes.TABLE_NOT_FOUND,
          'Select an active table from this restaurant',
        )
      }

      branchId = table.branchId
      taxEnabled = table.restaurant.taxEnabled
    } else {
      const branch = await this.prisma.branch.findFirst({
        where: {
          restaurantId,
          isActive: true,
          ...(membership.branchId ? { id: membership.branchId } : {}),
        },
        include: { restaurant: true },
        orderBy: { createdAt: 'asc' },
      })

      if (!branch) {
        throw new AppError(
          400,
          ErrorCodes.VALIDATION_ERROR,
          'An active branch is required for takeaway orders',
        )
      }

      branchId = branch.id
      taxEnabled = branch.restaurant.taxEnabled
    }

    const requestedItems: OrderItemInput[] = input.items.map((item) => ({
      ...item,
      addonIds: [],
    }))

    const order = await this.prisma.$transaction(
      async (tx) => {
        const preparedItems = await this.prepareOrderItems(
          tx,
          restaurantId,
          branchId,
          requestedItems,
        )
        const subtotalInPaise = preparedItems.reduce((sum, item) => sum + item.totalPriceInPaise, 0)
        const taxInPaise = calculateTaxInPaise(subtotalInPaise, taxEnabled)
        const totalInPaise = subtotalInPaise + taxInPaise
        const counter = await tx.restaurantOrderSequence.upsert({
          where: { restaurantId },
          create: { restaurantId, nextNumber: 2 },
          update: { nextNumber: { increment: 1 } },
        })
        const orderNumber = `ORD-${String(counter.nextNumber - 1).padStart(4, '0')}`

        const created = await tx.order.create({
          data: {
            restaurantId,
            branchId,
            tableId: table?.id ?? null,
            tableNumberSnapshot: table?.tableNumber ?? null,
            orderNumber,
            customerName: input.customerName,
            customerPhone: input.customerPhone,
            orderType: input.orderType,
            source: 'MANUAL',
            subtotalInPaise,
            taxInPaise,
            totalInPaise,
            specialInstructions: input.notes,
            items: {
              create: preparedItems.map((item) => ({
                menuItem: { connect: { id: item.menuItemId } },
                itemNameSnapshot: item.itemNameSnapshot,
                unitPriceInPaise: item.unitPriceInPaise,
                quantity: item.quantity,
                totalPriceInPaise: item.totalPriceInPaise,
                instructions: item.instructions,
                addons: { create: item.addons },
              })),
            },
          },
          include: orderInclude,
        })

        await tx.auditLog.create({
          data: {
            restaurantId,
            branchId,
            userId,
            action: 'order.manual_created',
            entityType: 'Order',
            entityId: created.id,
            metadata: {
              orderNumber: created.orderNumber,
              orderType: created.orderType,
              source: created.source,
            },
          },
        })

        return created
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )

    return { order: this.serializeOrder(order) }
  }

  async listOrders(userId: string, restaurantId: string, query: ListOrdersQuery) {
    await ensureRestaurantRole(this.prisma, userId, restaurantId, ['STAFF', 'MANAGER', 'KITCHEN'])
    const pagination = getPagination(query)
    const createdAt: Prisma.DateTimeFilter = {}

    if (query.dateFrom) {
      createdAt.gte = new Date(query.dateFrom)
    }
    if (query.dateTo) {
      createdAt.lte = new Date(query.dateTo)
    }

    const where: Prisma.OrderWhereInput = {
      restaurantId,
      status: query.status,
      branchId: query.branchId,
      tableId: query.tableId,
      createdAt: Object.keys(createdAt).length > 0 ? createdAt : undefined,
    }

    const [total, orders] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
        include: orderInclude,
      }),
    ])

    return {
      orders: orders.map((order) => this.serializeOrder(order)),
      pagination: buildPaginationMeta(total, pagination.page, pagination.limit),
    }
  }

  async getOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: orderInclude,
    })

    if (!order) {
      throw new AppError(404, ErrorCodes.ORDER_NOT_FOUND, 'Order was not found')
    }

    await ensureRestaurantRole(this.prisma, userId, order.restaurantId, [
      'STAFF',
      'MANAGER',
      'KITCHEN',
    ])
    return this.serializeOrder(order)
  }

  async getPublicOrderStatus(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { table: true },
    })

    if (!order) {
      throw new AppError(404, ErrorCodes.ORDER_NOT_FOUND, 'Order was not found')
    }

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      tableNumber: order.tableNumberSnapshot ?? order.table?.tableNumber ?? null,
      placedAt: order.placedAt,
      acceptedAt: order.acceptedAt,
      preparingAt: order.preparingAt,
      readyAt: order.readyAt,
      servedAt: order.servedAt,
      cancelledAt: order.cancelledAt,
      updatedAt: order.updatedAt,
    }
  }

  async updateStatus(userId: string, orderId: string, nextStatus: OrderStatus) {
    const existing = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!existing) {
      throw new AppError(404, ErrorCodes.ORDER_NOT_FOUND, 'Order was not found')
    }

    await ensureRestaurantRole(this.prisma, userId, existing.restaurantId, ['MANAGER', 'KITCHEN'])
    assertOrderStatusTransition(existing.status, nextStatus)

    const timestampField = statusTimestampField(nextStatus)
    const now = new Date()
    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: nextStatus,
        ...(timestampField ? { [timestampField]: now } : {}),
      },
      include: orderInclude,
    })

    await this.audit.log({
      restaurantId: order.restaurantId,
      branchId: order.branchId,
      userId,
      action: 'order.status_updated',
      entityType: 'Order',
      entityId: order.id,
      metadata: { oldStatus: existing.status, newStatus: nextStatus },
    })

    return {
      order: this.serializeOrder(order),
      oldStatus: existing.status,
      newStatus: nextStatus,
    }
  }

  private async prepareOrderItems(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    branchId: string,
    requestedItems: OrderItemInput[],
  ): Promise<PreparedOrderItem[]> {
    const menuItemIds = [...new Set(requestedItems.map((item) => item.menuItemId))]
    const menuItems = await tx.menuItem.findMany({
      where: {
        id: { in: menuItemIds },
        restaurantId,
        isActive: true,
        isAvailable: true,
        category: { isActive: true },
        OR: [{ branchId: null }, { branchId }],
      },
      include: {
        addonGroups: {
          include: {
            addons: { where: { isAvailable: true } },
          },
        },
      },
    })

    if (menuItems.length !== menuItemIds.length) {
      throw new AppError(
        400,
        ErrorCodes.MENU_ITEM_UNAVAILABLE,
        'One or more menu items are unavailable',
      )
    }

    const menuItemMap = new Map(menuItems.map((item) => [item.id, item]))

    return requestedItems.map((requestedItem) => {
      const menuItem = menuItemMap.get(requestedItem.menuItemId)
      if (!menuItem) {
        throw new AppError(400, ErrorCodes.MENU_ITEM_UNAVAILABLE, 'Menu item is unavailable')
      }

      const selectedAddonIds = [...new Set(requestedItem.addonIds)]
      if (selectedAddonIds.length !== requestedItem.addonIds.length) {
        throw new AppError(400, ErrorCodes.VALIDATION_ERROR, 'Duplicate add-ons are not allowed')
      }

      const addonById = new Map(
        menuItem.addonGroups.flatMap((group) =>
          group.addons.map((addon) => [addon.id, { addon, group }] as const),
        ),
      )
      const selectedAddons = selectedAddonIds.map((addonId) => {
        const entry = addonById.get(addonId)
        if (!entry) {
          throw new AppError(
            400,
            ErrorCodes.MENU_ITEM_UNAVAILABLE,
            'One or more add-ons are unavailable',
          )
        }
        return entry
      })

      for (const group of menuItem.addonGroups) {
        const selectedCount = selectedAddons.filter((entry) => entry.group.id === group.id).length
        if (selectedCount < group.minSelect || (group.isRequired && selectedCount === 0)) {
          throw new AppError(
            400,
            ErrorCodes.VALIDATION_ERROR,
            `Add-on group "${group.name}" requires more selections`,
          )
        }
        if (selectedCount > group.maxSelect) {
          throw new AppError(
            400,
            ErrorCodes.VALIDATION_ERROR,
            `Add-on group "${group.name}" has too many selections`,
          )
        }
      }

      const addonTotal = selectedAddons.reduce((sum, entry) => sum + entry.addon.priceInPaise, 0)
      const unitWithAddons = menuItem.priceInPaise + addonTotal
      const totalPriceInPaise = unitWithAddons * requestedItem.quantity

      return {
        menuItemId: menuItem.id,
        itemNameSnapshot: menuItem.name,
        unitPriceInPaise: menuItem.priceInPaise,
        quantity: requestedItem.quantity,
        totalPriceInPaise,
        instructions: requestedItem.instructions,
        addons: selectedAddons.map((entry) => ({
          addonNameSnapshot: entry.addon.name,
          addonPriceInPaise: entry.addon.priceInPaise,
        })),
      }
    })
  }

  private serializeOrder(order: OrderWithDetails) {
    return {
      id: order.id,
      restaurantId: order.restaurantId,
      branchId: order.branchId,
      tableId: order.tableId,
      tableNumber: order.tableNumberSnapshot ?? order.table?.tableNumber ?? null,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      status: order.status,
      orderType: order.orderType,
      source: order.source,
      subtotalInPaise: order.subtotalInPaise,
      taxInPaise: order.taxInPaise,
      totalInPaise: order.totalInPaise,
      specialInstructions: order.specialInstructions,
      placedAt: order.placedAt.toISOString(),
      acceptedAt: order.acceptedAt?.toISOString() ?? null,
      preparingAt: order.preparingAt?.toISOString() ?? null,
      readyAt: order.readyAt?.toISOString() ?? null,
      servedAt: order.servedAt?.toISOString() ?? null,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      items: order.items.map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        name: item.itemNameSnapshot,
        unitPriceInPaise: item.unitPriceInPaise,
        quantity: item.quantity,
        totalPriceInPaise: item.totalPriceInPaise,
        instructions: item.instructions,
        addons: item.addons.map((addon) => ({
          id: addon.id,
          name: addon.addonNameSnapshot,
          priceInPaise: addon.addonPriceInPaise,
        })),
      })),
    }
  }
}
