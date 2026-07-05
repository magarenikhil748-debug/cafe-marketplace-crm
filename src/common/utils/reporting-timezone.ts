export const DEFAULT_REPORTING_TIMEZONE = 'Asia/Kolkata'

type ZonedDateParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

const formatterFor = (timeZone: string) => {
  const cached = formatterCache.get(timeZone)
  if (cached) return cached

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  formatterCache.set(timeZone, formatter)
  return formatter
}

export const normalizeReportingTimezone = (timeZone?: string | null) => {
  if (!timeZone) return DEFAULT_REPORTING_TIMEZONE
  try {
    formatterFor(timeZone).format(new Date())
    return timeZone
  } catch {
    return DEFAULT_REPORTING_TIMEZONE
  }
}

const zonedParts = (date: Date, timeZone: string): ZonedDateParts => {
  const values = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  )

  return {
    year: values['year'] ?? 0,
    month: values['month'] ?? 0,
    day: values['day'] ?? 0,
    hour: values['hour'] ?? 0,
    minute: values['minute'] ?? 0,
    second: values['second'] ?? 0,
  }
}

const dateKeyFromParts = ({ year, month, day }: Pick<ZonedDateParts, 'year' | 'month' | 'day'>) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

const partsFromDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number)
  if (!year || !month || !day) throw new Error('Invalid reporting date')
  return { year, month, day }
}

export const addDaysToDateKey = (dateKey: string, days: number) => {
  const { year, month, day } = partsFromDateKey(dateKey)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

const zonedMidnightToUtc = (dateKey: string, timeZone: string) => {
  const { year, month, day } = partsFromDateKey(dateKey)
  const desiredAsUtc = Date.UTC(year, month - 1, day)
  let candidate = desiredAsUtc

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actual = zonedParts(new Date(candidate), timeZone)
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    )
    const adjustment = desiredAsUtc - actualAsUtc
    candidate += adjustment
    if (adjustment === 0) break
  }

  return new Date(candidate)
}

export const getCafeReportingPeriod = (now: Date, configuredTimeZone?: string | null) => {
  const timeZone = normalizeReportingTimezone(configuredTimeZone)
  const today = dateKeyFromParts(zonedParts(now, timeZone))
  const tomorrow = addDaysToDateKey(today, 1)
  const sevenDayStartDate = addDaysToDateKey(today, -6)

  return {
    timeZone,
    today,
    todayStart: zonedMidnightToUtc(today, timeZone),
    tomorrowStart: zonedMidnightToUtc(tomorrow, timeZone),
    sevenDayStartDate,
    sevenDayStart: zonedMidnightToUtc(sevenDayStartDate, timeZone),
  }
}
