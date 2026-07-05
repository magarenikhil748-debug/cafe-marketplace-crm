import dotenv from 'dotenv'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach } from 'vitest'

declare global {
  var testApp: FastifyInstance | undefined
}

const cleanDatabase = async (app: FastifyInstance) => {
  await app.prisma.$transaction([
    app.prisma.earlyAccessLead.deleteMany(),
    app.prisma.auditLog.deleteMany(),
    app.prisma.reservation.deleteMany(),
    app.prisma.reservationOffer.deleteMany(),
    app.prisma.idempotencyKey.deleteMany(),
    app.prisma.orderItemAddon.deleteMany(),
    app.prisma.orderItem.deleteMany(),
    app.prisma.order.deleteMany(),
    app.prisma.menuItemAddon.deleteMany(),
    app.prisma.menuItemAddonGroup.deleteMany(),
    app.prisma.menuItem.deleteMany(),
    app.prisma.menuCategory.deleteMany(),
    app.prisma.diningTable.deleteMany(),
    app.prisma.restaurantMember.deleteMany(),
    app.prisma.branch.deleteMany(),
    app.prisma.restaurantOrderSequence.deleteMany(),
    app.prisma.restaurant.deleteMany(),
    app.prisma.user.deleteMany(),
  ])
}

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test'
  dotenv.config({ path: '.env.test', override: true })
  const { buildApp } = await import('../src/app')
  globalThis.testApp = await buildApp()
  await globalThis.testApp.ready()
})

beforeEach(async () => {
  if (!globalThis.testApp) {
    throw new Error('Test app was not initialized')
  }

  await cleanDatabase(globalThis.testApp)
})

afterAll(async () => {
  await globalThis.testApp?.close()
})
