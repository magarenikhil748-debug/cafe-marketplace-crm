import { FoodType } from '@prisma/client'
import { z } from 'zod'

export const restaurantParamsSchema = z.object({
  restaurantId: z.string().uuid(),
})

export const categoryParamsSchema = z.object({
  categoryId: z.string().uuid(),
})

export const itemParamsSchema = z.object({
  itemId: z.string().uuid(),
})

export const addonGroupParamsSchema = z.object({
  addonGroupId: z.string().uuid(),
})

export const addonParamsSchema = z.object({
  addonId: z.string().uuid(),
})

export const listItemsQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  includeUnavailable: z.coerce.boolean().default(false),
})

export const createCategorySchema = z.object({
  branchId: z.string().uuid().optional(),
  name: z.string().trim().min(2),
  description: z.string().trim().min(1).optional(),
  sortOrder: z.number().int().default(0),
})

export const updateCategorySchema = createCategorySchema.partial().extend({
  isActive: z.boolean().optional(),
})

export const createItemSchema = z.object({
  branchId: z.string().uuid().optional(),
  name: z.string().trim().min(2),
  description: z.string().trim().min(1).optional(),
  priceInPaise: z.number().int().nonnegative(),
  imageUrl: z.string().url().optional(),
  foodType: z.nativeEnum(FoodType),
  isAvailable: z.boolean().default(true),
  isRecommended: z.boolean().default(false),
  preparationTimeMinutes: z.number().int().positive().optional(),
  sortOrder: z.number().int().default(0),
})

export const updateItemSchema = createItemSchema.partial()

export const updateAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
})

const addonGroupSchemaBase = z.object({
  name: z.string().trim().min(2),
  minSelect: z.number().int().min(0).default(0),
  maxSelect: z.number().int().min(1).default(1),
  isRequired: z.boolean().default(false),
})

export const createAddonGroupSchema = addonGroupSchemaBase.refine(
  (value) => value.maxSelect >= value.minSelect,
  {
    message: 'maxSelect must be greater than or equal to minSelect',
    path: ['maxSelect'],
  },
)

export const updateAddonGroupSchema = addonGroupSchemaBase
  .partial()
  .refine(
    (value) =>
      value.maxSelect === undefined ||
      value.minSelect === undefined ||
      value.maxSelect >= value.minSelect,
    {
      message: 'maxSelect must be greater than or equal to minSelect',
      path: ['maxSelect'],
    },
  )

export const createAddonSchema = z.object({
  name: z.string().trim().min(2),
  priceInPaise: z.number().int().nonnegative().default(0),
  isAvailable: z.boolean().default(true),
})

export const updateAddonSchema = createAddonSchema.partial()

export type CreateCategoryInput = z.infer<typeof createCategorySchema>
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>
export type CreateItemInput = z.infer<typeof createItemSchema>
export type UpdateItemInput = z.infer<typeof updateItemSchema>
export type CreateAddonGroupInput = z.infer<typeof createAddonGroupSchema>
export type UpdateAddonGroupInput = z.infer<typeof updateAddonGroupSchema>
export type CreateAddonInput = z.infer<typeof createAddonSchema>
export type UpdateAddonInput = z.infer<typeof updateAddonSchema>
export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>


