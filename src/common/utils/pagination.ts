export type PaginationInput = {
  page?: number
  limit?: number
}

export const getPagination = (input: PaginationInput = {}) => {
  const page = Math.max(1, input.page ?? 1)
  const limit = Math.min(100, Math.max(1, input.limit ?? 20))
  const skip = (page - 1) * limit

  return { page, limit, skip, take: limit }
}

export const buildPaginationMeta = (total: number, page: number, limit: number) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
})


