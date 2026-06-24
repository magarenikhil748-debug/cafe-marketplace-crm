import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../common/middleware/require-auth'
import { withSwagger } from '../../common/utils/route-schema'
import * as controller from './menu.controller'

export const menuRoutes = async (fastify: FastifyInstance) => {
  fastify.post(
    '/restaurants/:restaurantId/categories',
    {
      preHandler: [requireAuth],
      schema: withSwagger(['Menu'], 'Create category', 'Creates a menu category.', true),
    },
    controller.createCategory,
  )

  fastify.get(
    '/restaurants/:restaurantId/categories',
    {
      preHandler: [requireAuth],
      schema: withSwagger(['Menu'], 'List categories', 'Lists active menu categories.', true),
    },
    controller.listCategories,
  )

  fastify.patch(
    '/categories/:categoryId',
    {
      preHandler: [requireAuth],
      schema: withSwagger(['Menu'], 'Update category', 'Updates a menu category.', true),
    },
    controller.updateCategory,
  )

  fastify.delete(
    '/categories/:categoryId',
    {
      preHandler: [requireAuth],
      schema: withSwagger(['Menu'], 'Delete category', 'Soft-deletes a menu category.', true),
    },
    controller.deleteCategory,
  )

  fastify.post(
    '/categories/:categoryId/items',
    {
      preHandler: [requireAuth],
      schema: withSwagger(['Menu'], 'Create item', 'Creates a menu item inside a category.', true),
    },
    controller.createItem,
  )

  fastify.get(
    '/restaurants/:restaurantId/items',
    {
      preHandler: [requireAuth],
      schema: withSwagger(['Menu'], 'List items', 'Lists menu items for a restaurant.', true),
    },
    controller.listItems,
  )

  fastify.get(
    '/items/:itemId',
    {
      preHandler: [requireAuth],
      schema: withSwagger(['Menu'], 'Get item', 'Returns a menu item with add-ons.', true),
    },
    controller.getItem,
  )

  fastify.patch(
    '/items/:itemId',
    {
      preHandler: [requireAuth],
      schema: withSwagger(['Menu'], 'Update item', 'Updates a menu item.', true),
    },
    controller.updateItem,
  )

  fastify.delete(
    '/items/:itemId',
    {
      preHandler: [requireAuth],
      schema: withSwagger(['Menu'], 'Delete item', 'Soft-deletes a menu item.', true),
    },
    controller.deleteItem,
  )

  fastify.patch(
    '/items/:itemId/availability',
    {
      preHandler: [requireAuth],
      schema: withSwagger(
        ['Menu'],
        'Update availability',
        'Updates item availability and emits a socket event.',
        true,
      ),
    },
    controller.updateAvailability,
  )

  fastify.post(
    '/items/:itemId/addon-groups',
    {
      preHandler: [requireAuth],
      schema: withSwagger(
        ['Menu'],
        'Create addon group',
        'Creates an add-on group for a menu item.',
        true,
      ),
    },
    controller.createAddonGroup,
  )

  fastify.patch(
    '/addon-groups/:addonGroupId',
    {
      preHandler: [requireAuth],
      schema: withSwagger(['Menu'], 'Update addon group', 'Updates an add-on group.', true),
    },
    controller.updateAddonGroup,
  )

  fastify.delete(
    '/addon-groups/:addonGroupId',
    {
      preHandler: [requireAuth],
      schema: withSwagger(['Menu'], 'Delete addon group', 'Deletes an add-on group.', true),
    },
    controller.deleteAddonGroup,
  )

  fastify.post(
    '/addon-groups/:addonGroupId/addons',
    {
      preHandler: [requireAuth],
      schema: withSwagger(['Menu'], 'Create addon', 'Creates an add-on option.', true),
    },
    controller.createAddon,
  )

  fastify.patch(
    '/addons/:addonId',
    {
      preHandler: [requireAuth],
      schema: withSwagger(['Menu'], 'Update addon', 'Updates an add-on option.', true),
    },
    controller.updateAddon,
  )

  fastify.delete(
    '/addons/:addonId',
    {
      preHandler: [requireAuth],
      schema: withSwagger(['Menu'], 'Delete addon', 'Marks an add-on unavailable.', true),
    },
    controller.deleteAddon,
  )
}


