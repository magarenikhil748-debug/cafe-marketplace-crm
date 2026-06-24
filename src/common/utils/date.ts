export const startOfToday = (now = new Date()) => {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  return date
}

export const endOfToday = (now = new Date()) => {
  const date = new Date(now)
  date.setHours(23, 59, 59, 999)
  return date
}

export const parseDateOrUndefined = (value?: string) => (value ? new Date(value) : undefined)


