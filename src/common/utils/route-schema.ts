export const successResponseSchema = {
  type: 'object',
  required: ['success', 'message', 'data'],
  properties: {
    success: { type: 'boolean', const: true },
    message: { type: 'string' },
    data: {},
  },
}

export const errorResponseSchema = {
  type: 'object',
  required: ['success', 'message', 'code'],
  properties: {
    success: { type: 'boolean', const: false },
    message: { type: 'string' },
    code: { type: 'string' },
    details: {},
  },
}

export const commonErrorResponses = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
  409: errorResponseSchema,
  503: errorResponseSchema,
  500: errorResponseSchema,
}

export const withSwagger = (
  tags: string[],
  summary: string,
  description: string,
  authRequired: boolean,
  extra: Record<string, unknown> = {},
) => ({
  tags,
  summary,
  description,
  security: authRequired ? [{ bearerAuth: [] }] : [],
  response: {
    200: successResponseSchema,
    201: successResponseSchema,
    ...commonErrorResponses,
  },
  ...extra,
})


