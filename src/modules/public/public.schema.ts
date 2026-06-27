import { z } from 'zod'

const normalizePublicText = (value: string) =>
  Array.from(value)
    .map((character) => {
      const codePoint = character.charCodeAt(0)
      return codePoint <= 31 || codePoint === 127 ? ' ' : character
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()

const publicText = (maxLength: number) =>
  z.string().max(maxLength).transform(normalizePublicText).pipe(z.string().min(1).max(maxLength))

export const qrTokenParamsSchema = z.object({
  qrToken: z.string().trim().min(1).max(128),
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
  qrToken: z.string().trim().min(1).max(128),
  customerName: publicText(120).optional(),
  customerPhone: publicText(30).optional(),
  specialInstruction: publicText(1000).optional(),
  items: z
    .array(
      z.object({
        menuItemId: z.string().uuid(),
        quantity: z.number().int().positive().max(20),
      }),
    )
    .min(1)
    .max(50),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
})

export const earlyAccessLeadSchema = z.object({
  cafeName: publicText(120),
  ownerName: publicText(120),
  contact: publicText(160),
  location: publicText(160),
  note: publicText(600).optional(),
})

export const publicOrderParamsSchema = z.object({
  orderId: z.string().uuid(),
})

export type CafeTableOrderInput = z.infer<typeof cafeTableOrderSchema>
export type EarlyAccessLeadInput = z.infer<typeof earlyAccessLeadSchema>
