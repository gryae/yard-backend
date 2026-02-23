import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class LocationService {
  constructor(private prisma: PrismaService) {}

  // 🔹 GET ALL ZONES
  async getZones() {
    const zones = await this.prisma.location.findMany({
      distinct: ['zone'],
      select: { zone: true },
      orderBy: { zone: 'asc' },
    })

    return zones.map(z => z.zone)
  }

  // 🔹 GET ROWS BY ZONE
  async getRows(zone: string) {
    const rows = await this.prisma.location.findMany({
      where: { zone },
      distinct: ['row'],
      select: { row: true },
      orderBy: { row: 'asc' },
    })

    return rows.map(r => r.row)
  }

  // 🔹 GET AVAILABLE LANES
  async getAvailable(zone?: string, row?: string) {
    const locations = await this.prisma.location.findMany({
      where: {
        isActive: true,
        ...(zone && { zone }),
        ...(row && { row: Number(row) }),
        goods: null, // kosong
      },
      orderBy: [
        { zone: 'asc' },
        { row: 'asc' },
        { lane: 'asc' },
      ],
    })

    return locations
  }


  async getZoneMap(zone: string) {
    const locations = await this.prisma.location.findMany({
      where: { zone },
      include: {
        goods: {
          select: { id: true },
        },
      },
      orderBy: [
        { row: 'asc' },
        { lane: 'asc' },
      ],
    })

    return locations.map((l) => ({
      id: l.id,
      row: l.row,
      lane: l.lane,
      occupied: !!l.goods,
      isActive: l.isActive,
    }))
  }
}