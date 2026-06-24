import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaClient, type FoodType, type UserRole } from '@prisma/client'
import { buildQrUrl, generateQrToken } from '../src/common/utils/qr-code'

const prisma = new PrismaClient()
const password = 'Demo@12345'

const ensureMember = async (input: {
  restaurantId: string
  branchId?: string
  userId: string
  role: UserRole
}) => {
  const existing = await prisma.restaurantMember.findFirst({
    where: {
      restaurantId: input.restaurantId,
      branchId: input.branchId,
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
  const passwordHash = await bcrypt.hash(password, 10)

  const owner = await prisma.user.upsert({
    where: { email: 'owner@demo.com' },
    update: {
      name: 'Demo Owner',
      phone: '+919999999990',
      passwordHash,
      role: 'OWNER',
      isActive: true,
    },
    create: {
      name: 'Demo Owner',
      email: 'owner@demo.com',
      phone: '+919999999990',
      passwordHash,
      role: 'OWNER',
    },
  })

  const kitchen = await prisma.user.upsert({
    where: { email: 'kitchen@demo.com' },
    update: {
      name: 'Kitchen Display',
      phone: '+919999999991',
      passwordHash,
      role: 'KITCHEN',
      isActive: true,
    },
    create: {
      name: 'Kitchen Display',
      email: 'kitchen@demo.com',
      phone: '+919999999991',
      passwordHash,
      role: 'KITCHEN',
    },
  })

  const restaurant = await prisma.restaurant.upsert({
    where: { slug: 'spice-garden-bistro' },
    update: {
      name: 'Spice Garden Bistro',
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
      name: 'Spice Garden Bistro',
      slug: 'spice-garden-bistro',
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
    data: { isActive: true },
  })

  await ensureMember({ restaurantId: restaurant.id, userId: owner.id, role: 'OWNER' })
  await ensureMember({
    restaurantId: restaurant.id,
    branchId: activeBranch.id,
    userId: kitchen.id,
    role: 'KITCHEN',
  })

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
    foodType: 'VEG',
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
    foodType: 'NON_VEG',
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
    foodType: 'VEG',
    preparationTimeMinutes: 22,
    sortOrder: 1,
  })
  await ensureItem({
    restaurantId: restaurant.id,
    categoryId: categories.mainCourse.id,
    name: 'Butter Chicken',
    description: 'Creamy tomato gravy with tender chicken.',
    priceInPaise: 42000,
    foodType: 'NON_VEG',
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
    foodType: 'VEG',
    preparationTimeMinutes: 15,
    sortOrder: 2,
  })
  await ensureItem({
    restaurantId: restaurant.id,
    categoryId: categories.mainCourse.id,
    name: 'Garlic Naan',
    description: 'Tandoor naan finished with garlic butter.',
    priceInPaise: 7000,
    foodType: 'VEG',
    preparationTimeMinutes: 8,
    sortOrder: 3,
  })
  await ensureItem({
    restaurantId: restaurant.id,
    categoryId: categories.beverages.id,
    name: 'Masala Chaas',
    description: 'Spiced buttermilk with roasted cumin.',
    priceInPaise: 9000,
    foodType: 'BEVERAGE',
    preparationTimeMinutes: 5,
    sortOrder: 1,
  })
  await ensureItem({
    restaurantId: restaurant.id,
    categoryId: categories.desserts.id,
    name: 'Gulab Jamun',
    description: 'Warm khoya dumplings in cardamom syrup.',
    priceInPaise: 12000,
    foodType: 'VEG',
    preparationTimeMinutes: 6,
    sortOrder: 1,
  })

  console.log('\nDemo seed complete')
  console.log('Owner login: owner@demo.com / Demo@12345')
  console.log('Kitchen login: kitchen@demo.com / Demo@12345')
  console.log(`restaurantId: ${restaurant.id}`)
  console.log(`branchId: ${activeBranch.id}`)
  console.log('Tables and sample QR URLs:')
  for (const table of tables) {
    console.log(`- ${table.tableLabel ?? table.tableNumber}: id=${table.id} qrUrl=${table.qrUrl}`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
