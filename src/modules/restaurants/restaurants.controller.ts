import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppError, ErrorCodes } from '../../common/errors/app-error'
import { sendSuccess } from '../../common/utils/api-response'
import {
  createRestaurantSchema,
  restaurantParamsSchema,
  updateRestaurantSchema,
} from './restaurants.schema'
import { RestaurantsService } from './restaurants.service'
import {
  CAFE_IMAGE_MAX_BYTES,
  CafeImageUploadService,
  isSupportedCafeImageMimeType,
} from './cafe-image-upload.service'

const requireUserId = (request: FastifyRequest) => {
  if (!request.authUser) {
    throw new AppError(401, ErrorCodes.AUTH_UNAUTHORIZED, 'Authentication is required')
  }
  return request.authUser.id
}

export const createRestaurant = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const input = createRestaurantSchema.parse(request.body)
  const service = new RestaurantsService(request.server.prisma)
  const restaurant = await service.create(userId, input)

  return sendSuccess(reply, 'Restaurant created successfully', { restaurant }, 201)
}

export const listRestaurants = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const service = new RestaurantsService(request.server.prisma)
  const restaurants = await service.list(userId)

  return sendSuccess(reply, 'Restaurants fetched successfully', { restaurants })
}

export const getRestaurant = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = restaurantParamsSchema.parse(request.params)
  const service = new RestaurantsService(request.server.prisma)
  const restaurant = await service.get(userId, params.restaurantId)

  return sendSuccess(reply, 'Restaurant fetched successfully', { restaurant })
}

export const updateRestaurant = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = restaurantParamsSchema.parse(request.params)
  const input = updateRestaurantSchema.parse(request.body)
  const service = new RestaurantsService(request.server.prisma)
  const restaurant = await service.update(userId, params.restaurantId, input)

  return sendSuccess(reply, 'Restaurant updated successfully', { restaurant })
}

export const deleteRestaurant = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = restaurantParamsSchema.parse(request.params)
  const service = new RestaurantsService(request.server.prisma)
  const restaurant = await service.delete(userId, params.restaurantId)

  return sendSuccess(reply, 'Restaurant deleted successfully', { restaurant })
}

export const uploadRestaurantImage = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = restaurantParamsSchema.parse(request.params)
  const service = new CafeImageUploadService(request.server.prisma)

  // Authorize before buffering multipart data so another cafe cannot consume upload resources.
  await service.authorize(userId, params.restaurantId)

  if (!request.isMultipart()) {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, 'A multipart image file is required.')
  }

  let file
  try {
    file = await request.file({ limits: { fileSize: CAFE_IMAGE_MAX_BYTES, files: 1 } })
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'FST_REQ_FILE_TOO_LARGE'
    ) {
      throw new AppError(413, ErrorCodes.IMAGE_UPLOAD_TOO_LARGE, 'Image must be 5 MB or smaller.')
    }
    throw error
  }

  if (!file || file.fieldname !== 'file') {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, 'Add one image in the "file" field.')
  }

  if (!isSupportedCafeImageMimeType(file.mimetype)) {
    throw new AppError(
      415,
      ErrorCodes.IMAGE_UPLOAD_INVALID_TYPE,
      'Only JPEG, PNG, and WebP images are allowed.',
    )
  }

  let buffer: Buffer
  try {
    buffer = await file.toBuffer()
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'FST_REQ_FILE_TOO_LARGE'
    ) {
      throw new AppError(413, ErrorCodes.IMAGE_UPLOAD_TOO_LARGE, 'Image must be 5 MB or smaller.')
    }
    throw error
  }

  const image = await service.upload(params.restaurantId, { buffer, mimetype: file.mimetype })
  return sendSuccess(reply, 'Cafe image uploaded successfully', { image }, 201)
}
