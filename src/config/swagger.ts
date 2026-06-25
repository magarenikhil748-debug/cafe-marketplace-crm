import type { SwaggerOptions } from '@fastify/swagger'
import type { FastifySwaggerUiOptions } from '@fastify/swagger-ui'

export const swaggerOptions: SwaggerOptions = {
  openapi: {
    info: {
      title: 'Restaurant QR Menu and Ordering API',
      description:
        'Production-ready backend API for restaurant QR menus, table ordering, KDS live updates, and basic analytics.',
      version: '1.0.0',
    },
    servers: [{ url: 'http://localhost:3000', description: 'Local development' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http' as const,
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    tags: [
      { name: 'Health' },
      { name: 'Auth' },
      { name: 'Users' },
      { name: 'Restaurants' },
      { name: 'Branches' },
      { name: 'Tables' },
      { name: 'Menu' },
      { name: 'Public' },
      { name: 'Orders' },
      { name: 'Dashboard' },
      { name: 'Admin' },
    ],
  },
}

export const swaggerUiOptions: FastifySwaggerUiOptions = {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true,
  },
}
