import { z } from 'zod'

const optionalText = z.string().trim().min(1).optional()

export const restaurantParamsSchema = z.object({
  restaurantId: z.string().uuid(),
})

export const createRestaurantSchema = z.object({
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

export const updateRestaurantSchema = createRestaurantSchema.partial()

export type CreateRestaurantInput = z.infer<typeof createRestaurantSchema>
export type UpdateRestaurantInput = z.infer<typeof updateRestaurantSchema>
