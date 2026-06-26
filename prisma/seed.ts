import 'dotenv/config'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { FoodType, PrismaClient, UserRole } from '@prisma/client'

const prisma = new PrismaClient()
const seedCafeName = 'Spice Garden Bistro'
const seedCafeSlug = 'spice-garden-bistro'

const getRequiredSeedEnv = (name: string) => {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new Error(`Missing required seed environment variable: ${name}`)
  }

  return value
}

const getSeedCredentials = () => ({
  adminEmail: getRequiredSeedEnv('SEED_ADMIN_EMAIL').toLowerCase(),
  adminPassword: getRequiredSeedEnv('SEED_ADMIN_PASSWORD'),
  ownerEmail: getRequiredSeedEnv('SEED_OWNER_EMAIL').toLowerCase(),
  ownerPassword: getRequiredSeedEnv('SEED_OWNER_PASSWORD'),
})

const generateQrToken = () => randomBytes(24).toString('base64url')

const buildQrUrl = (qrToken: string) => {
  const frontendUrl = (process.env['FRONTEND_URL']?.trim() || 'http://localhost:5173').replace(
    /\/$/,
    '',
  )
  return `${frontendUrl}/menu/${qrToken}`
}

const ensureMember = async (input: {
  restaurantId: string
  branchId?: string
  userId: string
  role: UserRole
}) => {
  const existing = await prisma.restaurantMember.findFirst({
    where: {
      restaurantId: input.restaurantId,
      branchId: input.branchId ?? null,
      userId: input.userId,
    },
  })

  if (existing) {
    return prisma.restaurantMember.update({
      where: { id: existing.id },
      data: { role: input.role },
    })
  }

  return prisma.restaurantMember.create({
    data: input,
  })
}

const ensureCategory = async (
  restaurantId: string,
  name: string,
  sortOrder: number,
  description?: string,
) => {
  const existing = await prisma.menuCategory.findFirst({
    where: { restaurantId, name },
  })

  if (existing) {
    return prisma.menuCategory.update({
      where: { id: existing.id },
      data: { description, sortOrder, isActive: true },
    })
  }

  return prisma.menuCategory.create({
    data: { restaurantId, name, description, sortOrder },
  })
}

const ensureItem = async (input: {
  restaurantId: string
  categoryId: string
  name: string
  description: string
  priceInPaise: number
  foodType: FoodType
  isRecommended?: boolean
  preparationTimeMinutes?: number
  sortOrder: number
}) => {
  const existing = await prisma.menuItem.findFirst({
    where: { restaurantId: input.restaurantId, name: input.name },
  })

  const data = {
    restaurantId: input.restaurantId,
    categoryId: input.categoryId,
    name: input.name,
    description: input.description,
    priceInPaise: input.priceInPaise,
    foodType: input.foodType,
    isRecommended: input.isRecommended ?? false,
    preparationTimeMinutes: input.preparationTimeMinutes,
    sortOrder: input.sortOrder,
    isActive: true,
    isAvailable: true,
  }

  if (existing) {
    return prisma.menuItem.update({ where: { id: existing.id }, data })
  }

  return prisma.menuItem.create({ data })
}

async function main() {
  const seedCredentials = getSeedCredentials()
  const [adminPasswordHash, ownerPasswordHash] = await Promise.all([
    bcrypt.hash(seedCredentials.adminPassword, 10),
    bcrypt.hash(seedCredentials.ownerPassword, 10),
  ])

  const owner = await prisma.user.upsert({
    where: { email: seedCredentials.ownerEmail },
    update: {
      name: 'Demo Owner',
      phone: '+919999999990',
      passwordHash: ownerPasswordHash,
      role: UserRole.OWNER,
      isActive: true,
    },
    create: {
      name: 'Demo Owner',
      email: seedCredentials.ownerEmail,
      phone: '+919999999990',
      passwordHash: ownerPasswordHash,
      role: UserRole.OWNER,
    },
  })

  const admin = await prisma.user.upsert({
    where: { email: seedCredentials.adminEmail },
    update: {
      name: 'Platform Admin',
      passwordHash: adminPasswordHash,
      role: UserRole.ADMIN,
      isActive: true,
    },
    create: {
      name: 'Platform Admin',
      email: seedCredentials.adminEmail,
      passwordHash: adminPasswordHash,
      role: UserRole.ADMIN,
    },
  })

  const restaurant = await prisma.restaurant.upsert({
    where: { slug: seedCafeSlug },
    update: {
      name: seedCafeName,
      description: 'A modern Indian bistro serving tandoor favorites, curries, and biryani.',
      ownerId: owner.id,
      phone: '+911122334455',
      email: 'hello@spicegarden.example',
      address: 'MG Road',
      city: 'Bengaluru',
      imageUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4',
      currency: 'INR',
      taxEnabled: true,
      gstNumber: '29ABCDE1234F1Z5',
      isActive: true,
      isApproved: true,
    },
    create: {
      name: seedCafeName,
      slug: seedCafeSlug,
      description: 'A modern Indian bistro serving tandoor favorites, curries, and biryani.',
      ownerId: owner.id,
      phone: '+911122334455',
      email: 'hello@spicegarden.example',
      address: 'MG Road',
      city: 'Bengaluru',
      imageUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4',
      currency: 'INR',
      taxEnabled: true,
      gstNumber: '29ABCDE1234F1Z5',
      isActive: true,
      isApproved: true,
      orderSequence: { create: { nextNumber: 1 } },
    },
  })

  await prisma.restaurantOrderSequence.upsert({
    where: { restaurantId: restaurant.id },
    update: {},
    create: { restaurantId: restaurant.id, nextNumber: 1 },
  })

  const branch =
    (await prisma.branch.findFirst({
      where: { restaurantId: restaurant.id, name: 'Main Branch' },
    })) ??
    (await prisma.branch.create({
      data: {
        restaurantId: restaurant.id,
        name: 'Main Branch',
        address: 'MG Road, Bengaluru',
        phone: '+911122334455',
      },
    }))

  const activeBranch = await prisma.branch.update({
    where: { id: branch.id },
    data: { address: 'MG Road, Bengaluru', phone: '+911122334455', isActive: true },
  })

  await ensureMember({ restaurantId: restaurant.id, userId: owner.id, role: UserRole.OWNER })

  const tables = []
  for (let i = 1; i <= 5; i += 1) {
    const tableNumber = String(i)
    const table = await prisma.diningTable.upsert({
      where: {
        restaurantId_branchId_tableNumber: {
          restaurantId: restaurant.id,
          branchId: activeBranch.id,
          tableNumber,
        },
      },
      update: {
        tableLabel: `Table ${i}`,
        isActive: true,
      },
      create: {
        restaurantId: restaurant.id,
        branchId: activeBranch.id,
        tableNumber,
        tableLabel: `Table ${i}`,
        qrToken: generateQrToken(),
        qrUrl: '',
      },
    })

    if (!table.qrUrl) {
      tables.push(
        await prisma.diningTable.update({
          where: { id: table.id },
          data: { qrUrl: buildQrUrl(table.qrToken) },
        }),
      )
    } else {
      tables.push(table)
    }
  }

  const categories = {
    starters: await ensureCategory(
      restaurant.id,
      'Starters',
      1,
      'Small plates and tandoor favorites',
    ),
    mainCourse: await ensureCategory(restaurant.id, 'Main Course', 2, 'Curries, dal, and breads'),
    biryani: await ensureCategory(restaurant.id, 'Biryani', 3, 'Aromatic rice dishes'),
    beverages: await ensureCategory(restaurant.id, 'Beverages', 4, 'Cooling drinks'),
    desserts: await ensureCategory(restaurant.id, 'Desserts', 5, 'Sweet finishes'),
  }

  await ensureItem({
    restaurantId: restaurant.id,
    categoryId: categories.starters.id,
    name: 'Paneer Tikka',
    description: 'Char-grilled paneer with peppers and house spices.',
    priceInPaise: 28000,
    foodType: FoodType.VEG,
    isRecommended: true,
    preparationTimeMinutes: 18,
    sortOrder: 1,
  })
  await ensureItem({
    restaurantId: restaurant.id,
    categoryId: categories.starters.id,
    name: 'Chicken Tikka',
    description: 'Smoky boneless chicken tikka with mint chutney.',
    priceInPaise: 34000,
    foodType: FoodType.NON_VEG,
    isRecommended: true,
    preparationTimeMinutes: 20,
    sortOrder: 2,
  })
  await ensureItem({
    restaurantId: restaurant.id,
    categoryId: categories.biryani.id,
    name: 'Veg Biryani',
    description: 'Dum-cooked vegetables and basmati rice.',
    priceInPaise: 26000,
    foodType: FoodType.VEG,
    preparationTimeMinutes: 22,
    sortOrder: 1,
  })
  await ensureItem({
    restaurantId: restaurant.id,
    categoryId: categories.mainCourse.id,
    name: 'Butter Chicken',
    description: 'Creamy tomato gravy with tender chicken.',
    priceInPaise: 42000,
    foodType: FoodType.NON_VEG,
    isRecommended: true,
    preparationTimeMinutes: 24,
    sortOrder: 1,
  })
  await ensureItem({
    restaurantId: restaurant.id,
    categoryId: categories.mainCourse.id,
    name: 'Dal Tadka',
    description: 'Yellow dal tempered with cumin, garlic, and ghee.',
    priceInPaise: 22000,
    foodType: FoodType.VEG,
    preparationTimeMinutes: 15,
    sortOrder: 2,
  })
  await ensureItem({
    restaurantId: restaurant.id,
    categoryId: categories.mainCourse.id,
    name: 'Garlic Naan',
    description: 'Tandoor naan finished with garlic butter.',
    priceInPaise: 7000,
    foodType: FoodType.VEG,
    preparationTimeMinutes: 8,
    sortOrder: 3,
  })
  await ensureItem({
    restaurantId: restaurant.id,
    categoryId: categories.beverages.id,
    name: 'Masala Chaas',
    description: 'Spiced buttermilk with roasted cumin.',
    priceInPaise: 9000,
    foodType: FoodType.BEVERAGE,
    preparationTimeMinutes: 5,
    sortOrder: 1,
  })
  await ensureItem({
    restaurantId: restaurant.id,
    categoryId: categories.desserts.id,
    name: 'Gulab Jamun',
    description: 'Warm khoya dumplings in cardamom syrup.',
    priceInPaise: 12000,
    foodType: FoodType.VEG,
    preparationTimeMinutes: 6,
    sortOrder: 1,
  })

  console.log('\nTavero seed complete')
  console.log(`Admin user ensured: ${admin.email}`)
  console.log(`Owner user ensured: ${owner.email}`)
  console.log(
    `Cafe ensured: ${restaurant.name} (${restaurant.slug}) active=${restaurant.isActive} approved=${restaurant.isApproved}`,
  )
  console.log(`Branch ensured: ${activeBranch.name}`)
  console.log(`Active tables ensured: ${tables.length}`)
  console.log('Menu categories and items ensured for public QR ordering.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
