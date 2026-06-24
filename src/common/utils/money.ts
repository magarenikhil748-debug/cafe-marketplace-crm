const DEFAULT_GST_RATE_BPS = 500

export const assertPaise = (amount: number, fieldName = 'amount') => {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`${fieldName} must be a non-negative integer in paise`)
  }
}

export const multiplyPaise = (amountInPaise: number, quantity: number) => {
  assertPaise(amountInPaise)
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('quantity must be a positive integer')
  }

  return amountInPaise * quantity
}

export const calculateTaxInPaise = (subtotalInPaise: number, taxEnabled: boolean) => {
  assertPaise(subtotalInPaise, 'subtotalInPaise')
  if (!taxEnabled) {
    return 0
  }

  return Math.round((subtotalInPaise * DEFAULT_GST_RATE_BPS) / 10_000)
}


