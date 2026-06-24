export const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const buildUniqueSlug = async (
  baseValue: string,
  exists: (slug: string) => Promise<boolean>,
) => {
  const baseSlug = slugify(baseValue) || 'restaurant'
  let candidate = baseSlug
  let suffix = 1

  while (await exists(candidate)) {
    suffix += 1
    candidate = `${baseSlug}-${suffix}`
  }

  return candidate
}


