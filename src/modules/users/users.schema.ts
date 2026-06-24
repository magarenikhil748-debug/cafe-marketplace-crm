import { UserRole } from '@prisma/client'
import { z } from 'zod'

export const restaurantIdParamsSchema = z.object({
  restaurantId: z.string().uuid(),
})

export const userIdParamsSchema = z.object({
  userId: z.string().uuid(),
})

export const createMemberSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email().toLowerCase(),
  phone: z.string().trim().min(1).optional(),
  password: z.string().min(8),
  role: z.nativeEnum(UserRole).refine((role) => role !== 'OWNER', {
    message: 'OWNER members must be created through restaurant ownership transfer',
  }),
  branchId: z.string().uuid().optional(),
})

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).optional(),
  phone: z.string().trim().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
})

export type CreateMemberInput = z.infer<typeof createMemberSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>


