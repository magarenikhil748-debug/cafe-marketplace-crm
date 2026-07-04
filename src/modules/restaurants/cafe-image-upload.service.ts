import type { PrismaClient } from '@prisma/client'
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary'
import { AppError, ErrorCodes } from '../../common/errors/app-error'
import { ensureRestaurantRole } from '../../common/middleware/require-role'
import { env } from '../../config/env'

export const CAFE_IMAGE_MAX_BYTES = 5 * 1024 * 1024

export const CAFE_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type CafeImageMimeType = (typeof CAFE_IMAGE_MIME_TYPES)[number]

type CloudinaryConfig = {
  cloudName: string
  apiKey: string
  apiSecret: string
}

type UploadInput = {
  buffer: Buffer
  mimetype: CafeImageMimeType
}

export type CafeImageUpload = {
  secureUrl: string
  publicId: string
  width: number
  height: number
  format: string
  bytes: number
}

const getCloudinaryConfig = (): CloudinaryConfig => {
  const cloudName = env.CLOUDINARY_CLOUD_NAME
  const apiKey = env.CLOUDINARY_API_KEY
  const apiSecret = env.CLOUDINARY_API_SECRET

  if (!cloudName || !apiKey || !apiSecret) {
    throw new AppError(
      500,
      ErrorCodes.IMAGE_UPLOAD_NOT_CONFIGURED,
      'Cafe image uploads are not configured. Add the Cloudinary environment variables.',
    )
  }

  return { cloudName, apiKey, apiSecret }
}

export const isSupportedCafeImageMimeType = (value: string): value is CafeImageMimeType =>
  CAFE_IMAGE_MIME_TYPES.some((type) => type === value)

const detectImageMimeType = (buffer: Buffer): CafeImageMimeType | null => {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png'
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }

  return null
}

const uploadBuffer = (
  buffer: Buffer,
  folder: string,
  config: CloudinaryConfig,
): Promise<UploadApiResponse> => {
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  })

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'image',
        folder,
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        unique_filename: true,
        overwrite: false,
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Cloudinary returned no upload result'))
          return
        }
        resolve(result)
      },
    )

    stream.end(buffer)
  })
}

export class CafeImageUploadService {
  constructor(private readonly prisma: PrismaClient) {}

  async authorize(userId: string, restaurantId: string) {
    await ensureRestaurantRole(this.prisma, userId, restaurantId, ['MANAGER', 'STAFF'])
  }

  async upload(restaurantId: string, input: UploadInput): Promise<CafeImageUpload> {
    if (input.buffer.length > CAFE_IMAGE_MAX_BYTES) {
      throw new AppError(413, ErrorCodes.IMAGE_UPLOAD_TOO_LARGE, 'Image must be 5 MB or smaller.')
    }

    if (detectImageMimeType(input.buffer) !== input.mimetype) {
      throw new AppError(
        415,
        ErrorCodes.IMAGE_UPLOAD_INVALID_TYPE,
        'File content must be a JPEG, PNG, or WebP image.',
      )
    }

    const config = getCloudinaryConfig()

    try {
      const result = await uploadBuffer(input.buffer, `tavero/cafes/${restaurantId}`, config)
      return {
        secureUrl: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
      }
    } catch {
      throw new AppError(
        502,
        ErrorCodes.IMAGE_UPLOAD_FAILED,
        'Image upload failed. Please try again.',
      )
    }
  }
}
