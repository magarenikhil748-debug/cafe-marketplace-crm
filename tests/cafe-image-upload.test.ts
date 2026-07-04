import { PassThrough } from 'node:stream'
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CAFE_IMAGE_MAX_BYTES } from '../src/modules/restaurants/cafe-image-upload.service'
import { env } from '../src/config/env'
import { app, authHeader, parseBody, registerOwner, type ApiEnvelope } from './helpers'

const multipartImage = (content: Buffer, mimetype: string, filename = 'cafe-image.jpg') => {
  const boundary = `----tavero-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const before = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimetype}\r\n\r\n`,
  )
  const after = Buffer.from(`\r\n--${boundary}--\r\n`)

  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([before, content, after]),
  }
}

const tinyJpeg = () => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])

afterEach(() => {
  vi.restoreAllMocks()
  delete env.CLOUDINARY_CLOUD_NAME
  delete env.CLOUDINARY_API_KEY
  delete env.CLOUDINARY_API_SECRET
})

describe('cafe image upload', () => {
  it('requires authentication', async () => {
    const response = await app().inject({
      method: 'POST',
      url: '/api/v1/restaurants/00000000-0000-4000-8000-000000000000/images',
    })

    expect(response.statusCode).toBe(401)
  })

  it('returns a safe client error for an unsupported upload content type', async () => {
    const response = await app().inject({
      method: 'POST',
      url: '/api/v1/restaurants/00000000-0000-4000-8000-000000000000/images',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'not-a-multipart-upload',
    })
    const body = parseBody<ApiEnvelope<never>>(response)

    expect(response.statusCode).toBe(415)
    expect(body.message).toBe('Unsupported media type')
    expect(body.details).toEqual({})
    expect(response.payload).not.toContain('stack')
  })

  it('does not allow an owner to upload to another cafe', async () => {
    const first = await registerOwner(app(), 'upload-first')
    const second = await registerOwner(app(), 'upload-second')
    const multipart = multipartImage(tinyJpeg(), 'image/jpeg')

    const response = await app().inject({
      method: 'POST',
      url: `/api/v1/restaurants/${first.data.restaurant.id}/images`,
      headers: { ...multipart.headers, ...authHeader(second.data.accessToken) },
      payload: multipart.payload,
    })

    expect(response.statusCode).toBe(403)
  })

  it('rejects SVG and unsupported MIME types', async () => {
    const owner = await registerOwner(app(), 'upload-svg')
    const multipart = multipartImage(Buffer.from('<svg></svg>'), 'image/svg+xml', 'image.svg')

    const response = await app().inject({
      method: 'POST',
      url: `/api/v1/restaurants/${owner.data.restaurant.id}/images`,
      headers: { ...multipart.headers, ...authHeader(owner.data.accessToken) },
      payload: multipart.payload,
    })
    const body = parseBody<ApiEnvelope<never>>(response)

    expect(response.statusCode).toBe(415)
    expect(body.code).toBe('IMAGE_UPLOAD_INVALID_TYPE')
  })

  it('rejects files larger than 5 MB', async () => {
    const owner = await registerOwner(app(), 'upload-large')
    const content = Buffer.alloc(CAFE_IMAGE_MAX_BYTES + 1, 0x61)
    content.set([0xff, 0xd8, 0xff], 0)
    const multipart = multipartImage(content, 'image/jpeg')

    const response = await app().inject({
      method: 'POST',
      url: `/api/v1/restaurants/${owner.data.restaurant.id}/images`,
      headers: { ...multipart.headers, ...authHeader(owner.data.accessToken) },
      payload: multipart.payload,
    })
    const body = parseBody<ApiEnvelope<never>>(response)

    expect(response.statusCode).toBe(413)
    expect(body.code).toBe('IMAGE_UPLOAD_TOO_LARGE')
  })

  it('fails only the upload route when Cloudinary is not configured', async () => {
    const owner = await registerOwner(app(), 'upload-config')
    const multipart = multipartImage(tinyJpeg(), 'image/jpeg')

    const response = await app().inject({
      method: 'POST',
      url: `/api/v1/restaurants/${owner.data.restaurant.id}/images`,
      headers: { ...multipart.headers, ...authHeader(owner.data.accessToken) },
      payload: multipart.payload,
    })
    const body = parseBody<ApiEnvelope<never>>(response)

    expect(response.statusCode).toBe(500)
    expect(body.code).toBe('IMAGE_UPLOAD_NOT_CONFIGURED')

    const health = await app().inject({ method: 'GET', url: '/health' })
    expect(health.statusCode).toBe(200)
  })

  it('returns safe Cloudinary metadata for a valid owner upload', async () => {
    const owner = await registerOwner(app(), 'upload-success')
    env.CLOUDINARY_CLOUD_NAME = 'test-cloud'
    env.CLOUDINARY_API_KEY = 'test-key'
    env.CLOUDINARY_API_SECRET = 'test-secret'

    vi.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation(((options, callback) => {
      const stream = new PassThrough()
      stream.on('finish', () => {
        callback?.(undefined, {
          secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/cafe.jpg',
          public_id: `tavero/cafes/${owner.data.restaurant.id}/safe-id`,
          width: 1600,
          height: 1200,
          format: 'jpg',
          bytes: 2048,
        } as UploadApiResponse)
      })
      expect(options).toMatchObject({
        folder: `tavero/cafes/${owner.data.restaurant.id}`,
        resource_type: 'image',
      })
      return stream
    }) as typeof cloudinary.uploader.upload_stream)

    const multipart = multipartImage(tinyJpeg(), 'image/jpeg')
    const response = await app().inject({
      method: 'POST',
      url: `/api/v1/restaurants/${owner.data.restaurant.id}/images`,
      headers: { ...multipart.headers, ...authHeader(owner.data.accessToken) },
      payload: multipart.payload,
    })
    const body = parseBody<
      ApiEnvelope<{
        image: {
          secureUrl: string
          publicId: string
          width: number
          height: number
          format: string
          bytes: number
        }
      }>
    >(response)

    expect(response.statusCode).toBe(201)
    expect(body.data.image).toEqual({
      secureUrl: 'https://res.cloudinary.com/test-cloud/image/upload/cafe.jpg',
      publicId: `tavero/cafes/${owner.data.restaurant.id}/safe-id`,
      width: 1600,
      height: 1200,
      format: 'jpg',
      bytes: 2048,
    })
    expect(response.payload).not.toContain('test-secret')
  })
})
