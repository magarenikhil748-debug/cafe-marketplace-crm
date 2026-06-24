export type PaymentIntentInput = {
  orderId: string
  amountInPaise: number
  currency: string
}

export type PaymentIntent = {
  provider: 'UNCONFIGURED'
  orderId: string
  amountInPaise: number
  currency: string
  status: 'NOT_IMPLEMENTED'
}

export interface PaymentService {
  createPaymentIntent(input: PaymentIntentInput): Promise<PaymentIntent>
}

export class PlaceholderPaymentService implements PaymentService {
  async createPaymentIntent(input: PaymentIntentInput): Promise<PaymentIntent> {
    return {
      provider: 'UNCONFIGURED',
      orderId: input.orderId,
      amountInPaise: input.amountInPaise,
      currency: input.currency,
      status: 'NOT_IMPLEMENTED',
    }
  }
}


