import { describe, expect, it } from 'vitest'
import {
  app,
  authHeader,
  createBranch,
  createTable,
  parseBody,
  registerOwner,
  type ApiEnvelope,
} from './helpers'

type TableRecord = {
  id: string
  tableNumber: string
  isActive: boolean
}

describe('Table management APIs', () => {
  it('creates a table-specific secure ordering URL', async () => {
    const registered = await registerOwner(app(), 'table-secure-qr')
    const branch = await createBranch(
      app(),
      registered.data.accessToken,
      registered.data.restaurant.id,
    )
    const table = await createTable(app(), registered.data.accessToken, branch.id)

    expect(table.qrToken).toHaveLength(32)
    expect(table.qrUrl).toContain(
      `/cafe/${registered.data.restaurant.slug}/menu?t=${encodeURIComponent(table.qrToken)}`,
    )
    expect(table.qrUrl).not.toContain(table.id)
  })

  it('lists inactive tables on request and allows a manager to reactivate them', async () => {
    const registered = await registerOwner(app(), 'table-reactivation')
    const token = registered.data.accessToken
    const branch = await createBranch(app(), token, registered.data.restaurant.id)
    const table = await createTable(app(), token, branch.id)

    const deactivateResponse = await app().inject({
      method: 'PATCH',
      url: `/api/v1/tables/${table.id}`,
      headers: authHeader(token),
      payload: { isActive: false },
    })
    expect(deactivateResponse.statusCode).toBe(200)

    const activeOnlyResponse = await app().inject({
      method: 'GET',
      url: `/api/v1/branches/${branch.id}/tables`,
      headers: authHeader(token),
    })
    const activeOnlyBody = parseBody<ApiEnvelope<{ tables: TableRecord[] }>>(activeOnlyResponse)
    expect(activeOnlyBody.data.tables).toHaveLength(0)

    const allTablesResponse = await app().inject({
      method: 'GET',
      url: `/api/v1/branches/${branch.id}/tables?includeInactive=true`,
      headers: authHeader(token),
    })
    const allTablesBody = parseBody<ApiEnvelope<{ tables: TableRecord[] }>>(allTablesResponse)
    expect(allTablesBody.data.tables).toEqual([
      expect.objectContaining({ id: table.id, isActive: false }),
    ])

    const reactivateResponse = await app().inject({
      method: 'PATCH',
      url: `/api/v1/tables/${table.id}`,
      headers: authHeader(token),
      payload: { isActive: true },
    })
    const reactivateBody = parseBody<ApiEnvelope<{ table: TableRecord }>>(reactivateResponse)
    expect(reactivateResponse.statusCode).toBe(200)
    expect(reactivateBody.data.table.isActive).toBe(true)
  })

  it('does not expose another restaurant table list', async () => {
    const firstOwner = await registerOwner(app(), 'table-owner-one')
    const secondOwner = await registerOwner(app(), 'table-owner-two')
    const branch = await createBranch(
      app(),
      firstOwner.data.accessToken,
      firstOwner.data.restaurant.id,
    )
    await createTable(app(), firstOwner.data.accessToken, branch.id)

    const response = await app().inject({
      method: 'GET',
      url: `/api/v1/branches/${branch.id}/tables?includeInactive=true`,
      headers: authHeader(secondOwner.data.accessToken),
    })

    expect(response.statusCode).toBe(403)
  })
})
