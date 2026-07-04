import bcrypt from 'bcryptjs'
import type { PrismaClient, UserRole } from '@prisma/client'
import { env } from '../../config/env'
import { AppError, ErrorCodes } from '../../common/errors/app-error'
import { generateRestaurantSlug } from '../../common/utils/restaurant-slug'
import { AuthRepository } from './auth.repository'
import type { ChangePasswordInput, LoginInput, RegisterInput } from './auth.schema'

export class AuthService {
  private readonly repository: AuthRepository

  constructor(private readonly prisma: PrismaClient) {
    this.repository = new AuthRepository(prisma)
  }

  async register(input: RegisterInput) {
    const existingUser = await this.repository.findUserByEmail(input.email)
    if (existingUser) {
      throw new AppError(409, ErrorCodes.CONFLICT, 'An account with this email already exists')
    }

    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS)
    const restaurant = input.restaurant
      ? {
          name: input.restaurant.name,
          slug: await generateRestaurantSlug(
            this.prisma,
            input.restaurant.slug ?? input.restaurant.name,
          ),
          description: input.restaurant.description,
          phone: input.restaurant.phone,
          email: input.restaurant.email,
          address: input.restaurant.address,
          city: input.restaurant.city,
          currency: input.restaurant.currency,
          taxEnabled: input.restaurant.taxEnabled,
          gstNumber: input.restaurant.gstNumber,
          logoUrl: input.restaurant.logoUrl,
          imageUrl: input.restaurant.imageUrl,
        }
      : undefined

    const result = await this.repository.createOwnerWithOptionalRestaurant(
      {
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash,
        role: 'OWNER',
      },
      restaurant,
    )

    return {
      user: this.toPublicUser(result.user),
      restaurant: result.restaurant,
    }
  }

  async login(input: LoginInput) {
    const user = await this.repository.findUserByEmail(input.email)
    if (!user?.isActive) {
      throw new AppError(401, ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Invalid email or password')
    }

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash)
    if (!passwordMatches) {
      throw new AppError(401, ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Invalid email or password')
    }

    return this.toPublicUser(user)
  }

  async me(userId: string) {
    const user = await this.repository.findUserById(userId)
    if (!user?.isActive) {
      throw new AppError(401, ErrorCodes.AUTH_UNAUTHORIZED, 'Authentication is required')
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt,
      memberships: user.memberships.map((membership) => ({
        id: membership.id,
        role: membership.role,
        restaurant: membership.restaurant,
        branch: membership.branch,
      })),
    }
  }

  async changePassword(userId: string, input: ChangePasswordInput) {
    const user = await this.repository.findUserCredentialsById(userId)
    if (!user?.isActive) {
      throw new AppError(401, ErrorCodes.AUTH_UNAUTHORIZED, 'Authentication is required')
    }

    const currentPasswordMatches = await bcrypt.compare(input.currentPassword, user.passwordHash)
    if (!currentPasswordMatches) {
      throw new AppError(401, ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Current password is incorrect')
    }

    if (input.newPassword === input.currentPassword) {
      throw new AppError(
        400,
        ErrorCodes.AUTH_PASSWORD_REUSE,
        'New password must be different from the current password',
      )
    }

    const passwordHash = await bcrypt.hash(input.newPassword, env.BCRYPT_SALT_ROUNDS)
    const updated = await this.repository.updatePassword(userId, passwordHash)
    return this.toPublicUser(updated)
  }

  private toPublicUser(user: {
    id: string
    name: string
    email: string
    phone: string | null
    role: UserRole
    mustChangePassword: boolean
    createdAt: Date
  }) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt,
    }
  }
}
