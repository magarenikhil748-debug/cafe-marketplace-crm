import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../common/middleware/require-auth'
import { withSwagger } from '../../common/utils/route-schema'
import * as controller from './auth.controller'

export const authRoutes = async (fastify: FastifyInstance) => {
  fastify.post(
    '/register',
    {
      schema: withSwagger(
        ['Auth'],
        'Register owner',
        'Creates an owner account and optionally creates the first restaurant profile.',
        false,
      ),
    },
    controller.register,
  )

  fastify.post(
    '/login',
    {
      schema: withSwagger(
        ['Auth'],
        'Login',
        'Authenticates an active Tavero user with email and password.',
        false,
      ),
    },
    controller.login,
  )

  fastify.get(
    '/me',
    {
      preHandler: [requireAuth],
      schema: withSwagger(
        ['Auth'],
        'Current user',
        'Returns the logged-in user and memberships.',
        true,
      ),
    },
    controller.me,
  )

  fastify.post(
    '/change-password',
    {
      preHandler: [requireAuth],
      config: {
        rateLimit: { max: 10, timeWindow: '15 minutes', groupId: 'auth-change-password' },
      },
      schema: withSwagger(
        ['Auth'],
        'Change password',
        'Changes the logged-in user password after verifying the current password.',
        true,
      ),
    },
    controller.changePassword,
  )
}
