import { z } from 'zod'

export const restaurantParamsSchema = z.object({
  restaurantId: z.string().uuid(),
})

export const branchParamsSchema = z.object({
  branchId: z.string().uuid(),
})

export const createBranchSchema = z.object({
  name: z.string().trim().min(2),
  address: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
})

export const updateBranchSchema = createBranchSchema.partial().extend({
  isActive: z.boolean().optional(),
})

export type CreateBranchInput = z.infer<typeof createBranchSchema>
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>


