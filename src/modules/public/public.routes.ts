import type { FastifyInstance } from 'fastify'
import { env } from '../../config/env'
import { withSwagger } from '../../common/utils/route-schema'
import {
  createCafeOrder,
  createPublicOrder,
  getPublicOrderStatus,
} from '../orders/orders.controller'
import * as controller from './public.controller'

export const publicRoutes = async (fastify: FastifyInstance) => {
  const publicOrderRateLimit = {
    max: env.PUBLIC_ORDER_RATE_LIMIT_MAX,
    timeWindow: env.PUBLIC_ORDER_RATE_LIMIT_WINDOW,
    groupId: 'public-order-placement',
  }

  const earlyAccessRateLimit = {
    max: 5,
    timeWindow: '1 hour',
    groupId: 'public-early-access',
  }

  fastify.post(
    '/early-access',
    {
      config: { rateLimit: earlyAccessRateLimit },
      schema: withSwagger(
        ['Public'],
        'Request early access',
        'Stores a validated cafe listing request for platform review.',
        false,
      ),
    },
    controller.createEarlyAccessLead,
  )

  fastify.get(
    '/cafes',
    {
      schema: withSwagger(
        ['Public'],
        'List marketplace cafes',
        'Returns active and approved cafes using public-safe fields.',
        false,
      ),
    },
    controller.listCafes,
  )

  fastify.get(
    '/cafes/:slug',
    {
      schema: withSwagger(
        ['Public'],
        'Get marketplace cafe',
        'Returns an active and approved cafe by slug using public-safe fields.',
        false,
      ),
    },
    controller.getCafe,
  )

  fastify.get(
    '/cafes/:slug/menu',
    {
      schema: withSwagger(
        ['Public'],
        'Get marketplace cafe menu',
        'Returns active categories and available items for an active and approved cafe.',
        false,
      ),
    },
    controller.getCafeMenu,
  )

  fastify.get(
    '/cafes/:slug/tables',
    {
      schema: withSwagger(
        ['Public'],
        'List cafe tables',
        'Returns active tables for an active and approved cafe.',
        false,
      ),
    },
    controller.listCafeTables,
  )

  fastify.post(
    '/cafes/:slug/orders',
    {
      config: { rateLimit: publicOrderRateLimit },
      schema: withSwagger(
        ['Public'],
        'Create cafe order',
        'Creates an order only from a valid table-specific QR token at an approved cafe.',
        false,
      ),
    },
    createCafeOrder,
  )

  fastify.get(
    '/qr/:qrToken',
    {
      schema: withSwagger(
        ['Public'],
        'QR lookup',
        'Returns restaurant, branch, and table metadata for a QR token.',
        false,
      ),
    },
    controller.getQr,
  )

  fastify.get(
    '/menu/:qrToken',
    {
      schema: withSwagger(
        ['Public'],
        'Public menu',
        'Returns active categories and available menu items for a QR token.',
        false,
      ),
    },
    controller.getMenu,
  )

  fastify.post(
    '/orders',
    {
      config: { rateLimit: publicOrderRateLimit },
      schema: withSwagger(
        ['Public'],
        'Create order',
        'Creates a customer order from a QR token with idempotency protection.',
        false,
      ),
    },
    createPublicOrder,
  )

  fastify.get(
    '/orders/:orderId/status',
    {
      schema: withSwagger(
        ['Public'],
        'Order status',
        'Returns safe public order status details.',
        false,
      ),
    },
    getPublicOrderStatus,
  )
}
