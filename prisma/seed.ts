import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {

  await prisma.location.deleteMany()

  const locations: any[] = []

  // BLOK A
  for (let row = 1; row <= 3; row++) {
    for (let lane = 1; lane <= 22; lane++) {
      locations.push({
        zone: 'A',
        row,
        lane,
      })
    }
  }

  // BLOK B
  for (let row = 1; row <= 2; row++) {
    for (let lane = 1; lane <= 19; lane++) {
      locations.push({
        zone: 'B',
        row,
        lane,
      })
    }
  }

  // BLOK C
  for (let row = 1; row <= 2; row++) {
    for (let lane = 1; lane <= 18; lane++) {
      locations.push({
        zone: 'C',
        row,
        lane,
      })
    }
  }

  // BLOK D
  for (let row = 1; row <= 2; row++) {
    for (let lane = 1; lane <= 18; lane++) {
      locations.push({
        zone: 'D',
        row,
        lane,
      })
    }
  }

  // BLOK E (PDI)
  for (let row = 1; row <= 16; row++) {
    for (let lane = 1; lane <= 3; lane++) {
      locations.push({
        zone: 'E',
        row,
        lane,
      })
    }
  }

  await prisma.location.createMany({
    data: locations,
  })




  await prisma.user.upsert({
  where: { id: '00000000-0000-0000-0000-000000000001' },
  update: {},
  create: {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'System',
    email: 'system@yard.local',
    password: 'SYSTEM_NO_LOGIN',
    role: 'GLOBAL',
  },
})

await prisma.user.upsert({
  where: { id: '1' },
  update: {},
  create: {
    id: '1',
    name: 'Admin',
    email: 'admin@yard.com',
    password: 'admin123',
    role: 'ADMIN',
  },
})

  console.log('✅ Layout + User Seeded')



}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect())