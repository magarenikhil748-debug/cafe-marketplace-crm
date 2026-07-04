import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import Fastify from 'fastify'
import { corsOptions } from './config/cors'
import { env } from './config/env'
import { swaggerOptions, swaggerUiOptions } from './config/swagger'
import { errorHandler } from './common/errors/error-handler'
import { sendSuccess } from './common/utils/api-response'
import { withSwagger } from './common/utils/route-schema'
import { authPlugin } from './plugins/auth.plugin'
import { prismaPlugin } from './plugins/prisma.plugin'
import { rateLimitPlugin } from './plugins/rateLimit.plugin'
import { socketPlugin } from './plugins/socket.plugin'
import { authRoutes } from './modules/auth/auth.routes'
import { usersRoutes } from './modules/users/users.routes'
import { restaurantsRoutes } from './modules/restaurants/restaurants.routes'
import { branchesRoutes } from './modules/branches/branches.routes'
import { tablesRoutes } from './modules/tables/tables.routes'
import { menuRoutes } from './modules/menu/menu.routes'
import { publicRoutes } from './modules/public/public.routes'
import { ordersRoutes } from './modules/orders/orders.routes'
import { dashboardRoutes } from './modules/dashboard/dashboard.routes'
import { adminRoutes } from './modules/admin/admin.routes'
import { CAFE_IMAGE_MAX_BYTES } from './modules/restaurants/cafe-image-upload.service'

export const buildApp = async () => {
  const logger =
    env.NODE_ENV === 'test'
      ? false
      : env.NODE_ENV === 'development'
        ? {
            level: env.LOG_LEVEL,
            transport: { target: 'pino-pretty', options: { colorize: true } },
          }
        : { level: env.LOG_LEVEL }

  const app = Fastify({
    logger,
    trustProxy: env.TRUST_PROXY,
  })

  app.setErrorHandler(errorHandler)

  await app.register(prismaPlugin)
  await app.register(authPlugin)
  await app.register(cors, corsOptions)
  await app.register(helmet)
  await app.register(multipart, {
    limits: {
      fileSize: CAFE_IMAGE_MAX_BYTES,
      files: 1,
      fields: 0,
      parts: 1,
    },
  })
  await app.register(rateLimitPlugin)
  await app.register(swagger, swaggerOptions)
  await app.register(swaggerUi, swaggerUiOptions)
  await app.register(socketPlugin)

  app.get(
    '/health',
    {
      schema: withSwagger(
        ['Health'],
        'Health check',
        'Returns application and database connection status.',
        false,
      ),
    },
    async (_request, reply) => {
      try {
        await app.prisma.$queryRawUnsafe('SELECT 1')
        return sendSuccess(reply, 'Application is healthy', {
          app: 'up',
          database: 'up',
          timestamp: new Date().toISOString(),
        })
      } catch {
        return reply.status(503).send({
          success: false,
          message: 'Application is not healthy',
          code: 'HEALTH_CHECK_FAILED',
          details: { app: 'up', database: 'down' },
        })
      }
    },
  )

  await app.register(authRoutes, { prefix: '/api/v1/auth' })
  await app.register(usersRoutes, { prefix: '/api/v1' })
  await app.register(restaurantsRoutes, { prefix: '/api/v1' })
  await app.register(branchesRoutes, { prefix: '/api/v1' })
  await app.register(tablesRoutes, { prefix: '/api/v1' })
  await app.register(menuRoutes, { prefix: '/api/v1' })
  await app.register(publicRoutes, { prefix: '/api/v1/public' })
  await app.register(ordersRoutes, { prefix: '/api/v1' })
  await app.register(dashboardRoutes, { prefix: '/api/v1' })
  await app.register(adminRoutes, { prefix: '/api/v1/admin' })

  return app
}
