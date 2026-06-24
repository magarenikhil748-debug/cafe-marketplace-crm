import { randomBytes } from 'crypto'
import QRCode from 'qrcode'
import { env } from '../../config/env'

export const generateQrToken = () => randomBytes(24).toString('base64url')

export const buildQrUrl = (qrToken: string) => {
  const frontendUrl = env.FRONTEND_URL.replace(/\/$/, '')
  return `${frontendUrl}/menu/${qrToken}`
}

export const buildCafeMenuUrl = (slug: string) => {
  const frontendUrl = env.FRONTEND_URL.replace(/\/$/, '')
  return `${frontendUrl}/cafe/${slug}/menu`
}

export const createQrCodeDataUrl = async (qrUrl: string) =>
  QRCode.toDataURL(qrUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 512,
  })
