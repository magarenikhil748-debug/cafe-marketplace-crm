import { z } from 'zod'

export const branchParamsSchema = z.object({
  branchId: z.string().uuid(),
})

export const tableParamsSchema = z.object({
  tableId: z.string().uuid(),
})

export const listTablesQuerySchema = z.object({
  includeInactive: z.coerce.boolean().default(false),
})

export const createTableSchema = z.object({
  tableNumber: z.string().trim().min(1),
  tableLabel: z.string().trim().min(1).optional(),
})

export const updateTableSchema = z.object({
  tableNumber: z.string().trim().min(1).optional(),
  tableLabel: z.string().trim().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
})

export type CreateTableInput = z.infer<typeof createTableSchema>
export type UpdateTableInput = z.infer<typeof updateTableSchema>
