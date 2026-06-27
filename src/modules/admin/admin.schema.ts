import { LeadStatus } from '@prisma/client'
import { z } from 'zod'

export const adminCafeParamsSchema = z.object({
  restaurantId: z.string().uuid(),
})

const optionalBooleanQuery = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional()

export const listAdminCafesQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  isApproved: optionalBooleanQuery,
  isActive: optionalBooleanQuery,
})

export const updateCafeApprovalSchema = z.object({
  isApproved: z.boolean(),
})

export const updateCafeStatusSchema = z.object({
  isActive: z.boolean(),
})

export const adminLeadParamsSchema = z.object({
  leadId: z.string().uuid(),
})

export const listAdminLeadsQuerySchema = z.object({
  status: z.nativeEnum(LeadStatus).optional(),
})

export const updateLeadStatusSchema = z.object({
  status: z.nativeEnum(LeadStatus),
})

export type ListAdminCafesQuery = z.infer<typeof listAdminCafesQuerySchema>
export type ListAdminLeadsQuery = z.infer<typeof listAdminLeadsQuerySchema>
