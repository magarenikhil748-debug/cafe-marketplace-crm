import { describe, expect, it } from 'vitest'
import { app, authHeader, parseBody, registerOwner, type ApiEnvelope } from './helpers'

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

  it('changes an authenticated user password and clears the temporary-password flag', async () => {
    const owner = await registerOwner(app(), 'change-password')
    await app().prisma.user.update({
      where: { id: owner.data.user.id },
      data: { mustChangePassword: true },
    })

    const response = await app().inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      headers: authHeader(owner.data.accessToken),
      payload: {
        currentPassword: 'StrongPass123',
        newPassword: 'SaferOwnerPass456',
      },
    })
    const body = parseBody<ApiEnvelope<{ user: { mustChangePassword: boolean } }>>(response)

    expect(response.statusCode).toBe(200)
    expect(body.data.user.mustChangePassword).toBe(false)
    expect(response.payload).not.toContain('passwordHash')
    expect(response.payload).not.toContain('SaferOwnerPass456')

    const oldLogin = await app().inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: owner.data.user.email, password: 'StrongPass123' },
    })
    expect(oldLogin.statusCode).toBe(401)

    const newLogin = await app().inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: owner.data.user.email, password: 'SaferOwnerPass456' },
    })
    expect(newLogin.statusCode).toBe(200)
  })

  it('rejects logged-out, incorrect-current, reused, and short password changes', async () => {
    const owner = await registerOwner(app(), 'change-password-guards')
    const endpoint = '/api/v1/auth/change-password'

    const loggedOut = await app().inject({
      method: 'POST',
      url: endpoint,
      payload: { currentPassword: 'StrongPass123', newPassword: 'AnotherPass456' },
    })
    expect(loggedOut.statusCode).toBe(401)

    const incorrect = await app().inject({
      method: 'POST',
      url: endpoint,
      headers: authHeader(owner.data.accessToken),
      payload: { currentPassword: 'WrongCurrent123', newPassword: 'AnotherPass456' },
    })
    expect(incorrect.statusCode).toBe(401)

    const reused = await app().inject({
      method: 'POST',
      url: endpoint,
      headers: authHeader(owner.data.accessToken),
      payload: { currentPassword: 'StrongPass123', newPassword: 'StrongPass123' },
    })
    expect(reused.statusCode).toBe(400)

    const short = await app().inject({
      method: 'POST',
      url: endpoint,
      headers: authHeader(owner.data.accessToken),
      payload: { currentPassword: 'StrongPass123', newPassword: 'short' },
    })
    expect(short.statusCode).toBe(400)
  })
})
