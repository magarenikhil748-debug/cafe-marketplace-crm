import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'

export const app = () => {
  if (!globalThis.testApp) {
    throw new Error('Test app was not initialized')
  }

  return globalThis.testApp
}

export const parseBody = <T>(response: { payload: string }) => JSON.parse(response.payload) as T

export type ApiEnvelope<T> = {
  success: boolean
  message: string
  data: T
  code?: string
  details?: unknown
}

export const authHeader = (token: string) => ({
  authorization: `Bearer ${token}`,
})

export const createPlatformAdmin = async (
  fastify: FastifyInstance,
  suffix = Date.now().toString(),
) => {
  const email = `admin-${suffix}@example.com`
  const password = 'StrongPass123'
  const passwordHash = await bcrypt.hash(password, 8)
  await fastify.prisma.user.create({
    data: {
      name: 'Platform Admin',
      email,
      passwordHash,
      role: 'ADMIN',
    },
  })

  const response = await fastify.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
  })

  return parseBody<ApiEnvelope<{ accessToken: string; user: { id: string; role: string } }>>(
    response,
  )
}

export const registerOwner = async (fastify: FastifyInstance, suffix = Date.now().toString()) => {
  const response = await fastify.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      name: 'Owner User',
      email: `owner-${suffix}@example.com`,
      password: 'StrongPass123',
      phone: '+919999999999',
      restaurant: {
        name: `Test Restaurant ${suffix}`,
        city: 'Bengaluru',
        taxEnabled: true,
      },
    },
  })

  return parseBody<
    ApiEnvelope<{
      accessToken: string
      user: { id: string; email: string }
      restaurant: { id: string; name: string; slug: string }
    }>
  >(response)
}

export const createBranch = async (
  fastify: FastifyInstance,
  token: string,
  restaurantId: string,
) => {
  const response = await fastify.inject({
    method: 'POST',
    url: `/api/v1/restaurants/${restaurantId}/branches`,
    headers: authHeader(token),
    payload: { name: 'Main Branch', address: 'MG Road', phone: '+911122334455' },
  })

  return parseBody<ApiEnvelope<{ branch: { id: string } }>>(response).data.branch
}

export const createTable = async (
  fastify: FastifyInstance,
  token: string,
  branchId: string,
  overrides: { tableNumber?: string; tableLabel?: string } = {},
) => {
  const response = await fastify.inject({
    method: 'POST',
    url: `/api/v1/branches/${branchId}/tables`,
    headers: authHeader(token),
    payload: { tableNumber: '1', tableLabel: 'Table 1', ...overrides },
  })

  return parseBody<
    ApiEnvelope<{
      table: {
        id: string
        tableNumber: string
        tableLabel: string | null
        qrToken: string
        qrUrl: string
      }
    }>
  >(response).data.table
}

export const createCategory = async (
  fastify: FastifyInstance,
  token: string,
  restaurantId: string,
) => {
  const response = await fastify.inject({
    method: 'POST',
    url: `/api/v1/restaurants/${restaurantId}/categories`,
    headers: authHeader(token),
    payload: { name: 'Starters', sortOrder: 1 },
  })

  return parseBody<ApiEnvelope<{ category: { id: string } }>>(response).data.category
}

export const createItem = async (
  fastify: FastifyInstance,
  token: string,
  categoryId: string,
  overrides = {},
) => {
  const response = await fastify.inject({
    method: 'POST',
    url: `/api/v1/categories/${categoryId}/items`,
    headers: authHeader(token),
    payload: {
      name: 'Paneer Tikka',
      description: 'Char-grilled paneer',
      priceInPaise: 28000,
      foodType: 'VEG',
      isRecommended: true,
      ...overrides,
    },
  })

  return parseBody<ApiEnvelope<{ item: { id: string; priceInPaise: number } }>>(response).data.item
}

export const setupOrderingFixture = async (suffix = Date.now().toString()) => {
  const fastify = app()
  const registered = await registerOwner(fastify, suffix)
  const token = registered.data.accessToken
  const restaurantId = registered.data.restaurant.id
  const branch = await createBranch(fastify, token, restaurantId)
  const table = await createTable(fastify, token, branch.id)
  const category = await createCategory(fastify, token, restaurantId)
  const item = await createItem(fastify, token, category.id)

  await fastify.prisma.restaurant.update({
    where: { id: restaurantId },
    data: { isApproved: true },
  })

  return { fastify, token, restaurantId, branch, table, category, item }
}
