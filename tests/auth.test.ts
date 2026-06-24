import { describe, expect, it } from 'vitest'
import { app, parseBody, registerOwner, type ApiEnvelope } from './helpers'

describe('Auth APIs', () => {
  it('registers an owner and optional restaurant', async () => {
    const response = await registerOwner(app(), 'register')

    expect(response.success).toBe(true)
    expect(response.data.accessToken).toBeTruthy()
    expect(response.data.user.email).toBe('owner-register@example.com')
    expect(response.data.restaurant.name).toBe('Test Restaurant register')
    expect(response.data.restaurant.slug).toBe('test-restaurant-register')
  })

  it('logs in with valid credentials', async () => {
    await registerOwner(app(), 'login')

    const response = await app().inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'owner-login@example.com',
        password: 'StrongPass123',
      },
    })

    const body = parseBody<ApiEnvelope<{ accessToken: string }>>(response)
    expect(response.statusCode).toBe(200)
    expect(body.data.accessToken).toBeTruthy()
  })

  it('rejects invalid login credentials', async () => {
    await registerOwner(app(), 'invalid-login')

    const response = await app().inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'owner-invalid-login@example.com',
        password: 'wrong-password',
      },
    })

    const body = parseBody<ApiEnvelope<unknown>>(response)
    expect(response.statusCode).toBe(401)
    expect(body.code).toBe('AUTH_INVALID_CREDENTIALS')
  })
})
