import { z } from 'zod'

export const restaurantParamsSchema = z.object({
  restaurantId: z.string().uuid(),
})

export const dashboardQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
})

export const topItemsQuerySchema = dashboardQuerySchema.extend({
  limit: z.coerce.number().int().positive().max(50).default(10),
})

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>
export type TopItemsQuery = z.infer<typeof topItemsQuerySchema>


