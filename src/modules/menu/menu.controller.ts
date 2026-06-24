import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppError, ErrorCodes } from '../../common/errors/app-error'
import { sendSuccess } from '../../common/utils/api-response'
import {
  addonGroupParamsSchema,
  addonParamsSchema,
  categoryParamsSchema,
  createAddonGroupSchema,
  createAddonSchema,
  createCategorySchema,
  createItemSchema,
  itemParamsSchema,
  listItemsQuerySchema,
  restaurantParamsSchema,
  updateAddonGroupSchema,
  updateAddonSchema,
  updateAvailabilitySchema,
  updateCategorySchema,
  updateItemSchema,
} from './menu.schema'
import { MenuService } from './menu.service'

const requireUserId = (request: FastifyRequest) => {
  if (!request.authUser) {
    throw new AppError(401, ErrorCodes.AUTH_UNAUTHORIZED, 'Authentication is required')
  }
  return request.authUser.id
}

export const createCategory = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = restaurantParamsSchema.parse(request.params)
  const input = createCategorySchema.parse(request.body)
  const service = new MenuService((request.server as any).prisma)
  const category = await service.createCategory(userId, params.restaurantId, input)

  return sendSuccess(reply, 'Menu category created successfully', { category }, 201)
}

export const listCategories = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = restaurantParamsSchema.parse(request.params)
  const service = new MenuService((request.server as any).prisma)
  const categories = await service.listCategories(userId, params.restaurantId)

  return sendSuccess(reply, 'Menu categories fetched successfully', { categories })
}

export const updateCategory = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = categoryParamsSchema.parse(request.params)
  const input = updateCategorySchema.parse(request.body)
  const service = new MenuService((request.server as any).prisma)
  const category = await service.updateCategory(userId, params.categoryId, input)

  return sendSuccess(reply, 'Menu category updated successfully', { category })
}

export const deleteCategory = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = categoryParamsSchema.parse(request.params)
  const service = new MenuService((request.server as any).prisma)
  const category = await service.deleteCategory(userId, params.categoryId)

  return sendSuccess(reply, 'Menu category deleted successfully', { category })
}

export const createItem = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = categoryParamsSchema.parse(request.params)
  const input = createItemSchema.parse(request.body)
  const service = new MenuService((request.server as any).prisma)
  const item = await service.createItem(userId, params.categoryId, input)

  return sendSuccess(reply, 'Menu item created successfully', { item }, 201)
}

export const listItems = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = restaurantParamsSchema.parse(request.params)
  const query = listItemsQuerySchema.parse(request.query)
  const service = new MenuService((request.server as any).prisma)
  const items = await service.listItems(userId, params.restaurantId, query)

  return sendSuccess(reply, 'Menu items fetched successfully', { items })
}

export const getItem = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = itemParamsSchema.parse(request.params)
  const service = new MenuService((request.server as any).prisma)
  const item = await service.getItem(userId, params.itemId)

  return sendSuccess(reply, 'Menu item fetched successfully', { item })
}

export const updateItem = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = itemParamsSchema.parse(request.params)
  const input = updateItemSchema.parse(request.body)
  const service = new MenuService((request.server as any).prisma)
  const item = await service.updateItem(userId, params.itemId, input)

  return sendSuccess(reply, 'Menu item updated successfully', { item })
}

export const deleteItem = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = itemParamsSchema.parse(request.params)
  const service = new MenuService((request.server as any).prisma)
  const item = await service.deleteItem(userId, params.itemId)

  return sendSuccess(reply, 'Menu item deleted successfully', { item })
}

export const updateAvailability = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = itemParamsSchema.parse(request.params)
  const input = updateAvailabilitySchema.parse(request.body)
  const service = new MenuService((request.server as any).prisma)
  const item = await service.updateAvailability(userId, params.itemId, input.isAvailable)
  const payload = {
    itemId: item.id,
    restaurantId: item.restaurantId,
    branchId: item.branchId,
    isAvailable: item.isAvailable,
    updatedAt: item.updatedAt,
  }

  request.server.io
    .to(`restaurant:${item.restaurantId}`)
    .emit('menu:item_availability_updated', payload)
  if (item.branchId) {
    request.server.io.to(`branch:${item.branchId}`).emit('menu:item_availability_updated', payload)
  }

  return sendSuccess(reply, 'Menu item availability updated successfully', { item })
}

export const createAddonGroup = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = itemParamsSchema.parse(request.params)
  const input = createAddonGroupSchema.parse(request.body)
  const service = new MenuService((request.server as any).prisma)
  const addonGroup = await service.createAddonGroup(userId, params.itemId, input)

  return sendSuccess(reply, 'Addon group created successfully', { addonGroup }, 201)
}

export const updateAddonGroup = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = addonGroupParamsSchema.parse(request.params)
  const input = updateAddonGroupSchema.parse(request.body)
  const service = new MenuService((request.server as any).prisma)
  const addonGroup = await service.updateAddonGroup(userId, params.addonGroupId, input)

  return sendSuccess(reply, 'Addon group updated successfully', { addonGroup })
}

export const deleteAddonGroup = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = addonGroupParamsSchema.parse(request.params)
  const service = new MenuService((request.server as any).prisma)
  const addonGroup = await service.deleteAddonGroup(userId, params.addonGroupId)

  return sendSuccess(reply, 'Addon group deleted successfully', { addonGroup })
}

export const createAddon = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = addonGroupParamsSchema.parse(request.params)
  const input = createAddonSchema.parse(request.body)
  const service = new MenuService((request.server as any).prisma)
  const addon = await service.createAddon(userId, params.addonGroupId, input)

  return sendSuccess(reply, 'Addon created successfully', { addon }, 201)
}

export const updateAddon = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = addonParamsSchema.parse(request.params)
  const input = updateAddonSchema.parse(request.body)
  const service = new MenuService((request.server as any).prisma)
  const addon = await service.updateAddon(userId, params.addonId, input)

  return sendSuccess(reply, 'Addon updated successfully', { addon })
}

export const deleteAddon = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = addonParamsSchema.parse(request.params)
  const service = new MenuService((request.server as any).prisma)
  const addon = await service.deleteAddon(userId, params.addonId)

  return sendSuccess(reply, 'Addon deleted successfully', { addon })
}


