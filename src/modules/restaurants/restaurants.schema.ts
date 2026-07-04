import { z } from 'zod'

const optionalText = z.string().trim().min(1).optional()
const httpImageUrl = z
  .string()
  .url()
  .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), {
    message: 'Image URL must use http or https',
  })

export const cafeGalleryImageSchema = z.object({
  url: httpImageUrl,
  type: z.enum(['INTERIOR', 'FOOD', 'COUNTER', 'OUTDOOR', 'AMBIENCE', 'OTHER']).optional(),
  sortOrder: z.number().int().min(0).max(1000).default(0),
})

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
  logoUrl: httpImageUrl.optional(),
  imageUrl: httpImageUrl.optional(),
  galleryImages: z.array(cafeGalleryImageSchema).max(15).optional(),
})

export const updateRestaurantSchema = createRestaurantSchema.partial()

export type CreateRestaurantInput = z.infer<typeof createRestaurantSchema>
export type UpdateRestaurantInput = z.infer<typeof updateRestaurantSchema>
