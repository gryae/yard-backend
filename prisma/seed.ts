import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {

  const locations: any[] = []

  // BLOK A
  for (let row = 1; row <= 3; row++) {
    for (let lane = 1; lane <= 22; lane++) {
      locations.push({ zone: 'A', row, lane })
    }
  }

  // BLOK B
  for (let row = 1; row <= 2; row++) {
    for (let lane = 1; lane <= 19; lane++) {
      locations.push({ zone: 'B', row, lane })
    }
  }

  // BLOK C
  for (let row = 1; row <= 2; row++) {
    for (let lane = 1; lane <= 18; lane++) {
      locations.push({ zone: 'C', row, lane })
    }
  }

  // BLOK D
  for (let row = 1; row <= 2; row++) {
    for (let lane = 1; lane <= 18; lane++) {
      locations.push({ zone: 'D', row, lane })
    }
  }

  // BLOK E (PDI)
  for (let row = 1; row <= 16; row++) {
    for (let lane = 1; lane <= 3; lane++) {
      locations.push({ zone: 'E', row, lane })
    }
  }

  // =========================
  // SAFE UPSERT LOCATIONS
  // =========================

  for (const loc of locations) {
    await prisma.location.upsert({
      where: {
        zone_row_lane: {
          zone: loc.zone,
          row: loc.row,
          lane: loc.lane,
        },
      },
      update: {}, // tidak update apa-apa
      create: loc,
    })
  }

  // =========================
  // USERS (tetap aman)
  // =========================

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
      password: '$2a$12$R9VIXuqNYjcWv3VYfaY7EON0kMRJKsgDD.UVf6Bx0wx2.0IdD/aeK',
      role: 'ADMIN',
    },
  })

  console.log('✅ Layout + User Seeded (SAFE MODE)')
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect())