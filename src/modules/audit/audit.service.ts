import type { Prisma, PrismaClient } from '@prisma/client'

type AuditInput = {
  restaurantId: string
  branchId?: string | null
  userId?: string | null
  action: string
  entityType: string
  entityId?: string | null
  metadata?: Prisma.InputJsonValue
}

export class AuditService {
  constructor(private readonly prisma: PrismaClient) {}

  async log(input: AuditInput) {
    await this.prisma.auditLog.create({
      data: {
        restaurantId: input.restaurantId,
        branchId: input.branchId ?? null,
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: input.metadata ?? {},
      },
    })
  }
}


