import { BusinessType, LeadStatus } from '@prisma/client'
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

export const resetOwnerPasswordSchema = z.object({
  temporaryPassword: z.string().min(8).max(128),
})

export const adminLeadParamsSchema = z.object({
  leadId: z.string().uuid(),
})

export const listAdminLeadsQuerySchema = z.object({
  status: z.nativeEnum(LeadStatus).optional(),
})

export const updateLeadStatusSchema = z.object({
  status: z.nativeEnum(LeadStatus),
})

export const convertLeadToCafeSchema = z.object({
  cafeName: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase and URL-safe'),
  businessType: z.nativeEnum(BusinessType),
  description: z.string().trim().max(500).optional(),
  city: z.string().trim().min(2).max(100),
  address: z.string().trim().min(3).max(250),
  phone: z.string().trim().min(5).max(30),
  ownerName: z.string().trim().min(2).max(100),
  ownerEmail: z.string().trim().email().max(254).toLowerCase(),
  temporaryPassword: z.string().min(8).max(128),
  tableCount: z.number().int().min(0).max(100).default(0),
  isApproved: z.boolean().default(false),
})

export type ListAdminCafesQuery = z.infer<typeof listAdminCafesQuerySchema>
export type ListAdminLeadsQuery = z.infer<typeof listAdminLeadsQuerySchema>
export type ConvertLeadToCafeInput = z.infer<typeof convertLeadToCafeSchema>
