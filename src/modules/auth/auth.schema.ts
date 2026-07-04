import { z } from 'zod'

const optionalText = z.string().trim().min(1).optional()

export const registerSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email().toLowerCase(),
  phone: optionalText,
  password: z.string().min(8),
  restaurant: z
    .object({
      name: z.string().trim().min(2),
      slug: optionalText,
      description: optionalText,
      phone: optionalText,
      email: z.string().trim().email().toLowerCase().optional(),
      address: optionalText,
      city: optionalText,
      currency: z.string().trim().length(3).default('INR'),
      taxEnabled: z.boolean().default(false),
      gstNumber: optionalText,
      logoUrl: z.string().url().optional(),
      imageUrl: z.string().url().optional(),
    })
    .optional(),
})

export const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
