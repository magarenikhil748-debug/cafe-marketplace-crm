import { z } from 'zod'

export const qrTokenParamsSchema = z.object({
  qrToken: z.string().trim().min(10),
})

export const cafeSlugParamsSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid cafe slug'),
})

export const cafeTableOrderSchema = z.object({
  tableNumber: z.string().trim().min(1).max(50),
  customerName: z.string().trim().min(1).max(120).optional(),
  customerPhone: z.string().trim().min(1).max(30).optional(),
  specialInstruction: z.string().trim().min(1).max(1000).optional(),
  items: z
    .array(
      z.object({
        menuItemId: z.string().uuid(),
        quantity: z.number().int().positive().max(99),
      }),
    )
    .min(1),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
})

export const publicOrderParamsSchema = z.object({
  orderId: z.string().uuid(),
})

export type CafeTableOrderInput = z.infer<typeof cafeTableOrderSchema>
