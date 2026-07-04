import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../common/middleware/require-auth'
import { requirePlatformAdmin } from '../../common/middleware/require-platform-admin'
import { withSwagger } from '../../common/utils/route-schema'
import * as controller from './admin.controller'

export const adminRoutes = async (fastify: FastifyInstance) => {
  const adminOnly = [requireAuth, requirePlatformAdmin]

  fastify.get(
    '/leads',
    {
      preHandler: adminOnly,
      schema: withSwagger(
        ['Admin'],
        'List early access leads',
        'Lists cafe early access requests for platform review.',
        true,
      ),
    },
    controller.listLeads,
  )

  fastify.patch(
    '/leads/:leadId/status',
    {
      preHandler: adminOnly,
      schema: withSwagger(
        ['Admin'],
        'Update lead status',
        'Updates an early access lead review status.',
        true,
      ),
    },
    controller.updateLeadStatus,
  )

  fastify.post(
    '/leads/:leadId/convert-to-cafe',
    {
      preHandler: adminOnly,
      schema: withSwagger(
        ['Admin'],
        'Convert lead to cafe',
        'Creates a private cafe workspace and owner account from a qualified lead.',
        true,
      ),
    },
    controller.convertLeadToCafe,
  )

  fastify.get(
    '/cafes',
    {
      preHandler: adminOnly,
      schema: withSwagger(
        ['Admin'],
        'List platform cafes',
        'Lists cafes for platform approval and suspension control.',
        true,
      ),
    },
    controller.listCafes,
  )

  fastify.patch(
    '/cafes/:restaurantId/approval',
    {
      preHandler: adminOnly,
      schema: withSwagger(
        ['Admin'],
        'Update cafe approval',
        'Approves or unapproves a cafe marketplace listing.',
        true,
      ),
    },
    controller.updateCafeApproval,
  )

  fastify.patch(
    '/cafes/:restaurantId/status',
    {
      preHandler: adminOnly,
      schema: withSwagger(['Admin'], 'Update cafe status', 'Suspends or reactivates a cafe.', true),
    },
    controller.updateCafeStatus,
  )

  fastify.post(
    '/cafes/:restaurantId/owner-password',
    {
      preHandler: adminOnly,
      schema: withSwagger(
        ['Admin'],
        'Reset cafe owner password',
        'Sets a temporary owner password and requires the owner to change it after login.',
        true,
      ),
    },
    controller.resetOwnerPassword,
  )
}
