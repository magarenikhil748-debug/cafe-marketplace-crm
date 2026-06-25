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

export type ListAdminCafesQuery = z.infer<typeof listAdminCafesQuerySchema>
