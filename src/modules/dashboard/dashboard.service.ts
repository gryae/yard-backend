import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { GoodsStatus } from '@prisma/client'

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  // ===============================
  // STATUS SUMMARY
  // ===============================

  async getSummary() {
    const statuses = Object.values(GoodsStatus)

    const summary: any = {}

    for (const status of statuses) {
      summary[status] = await this.prisma.goods.count({
        where: { currentStatus: status },
      })
    }

    return summary
  }

  // ===============================
  // AGING LIST
  // ===============================

  async getAgingList() {
    const goods = await this.prisma.goods.findMany({
      include: {
        unit: true,
      },
    })

    return goods.map(g => {
      const days = Math.floor(
        (Date.now() - new Date(g.updatedAt).getTime()) /
          (1000 * 60 * 60 * 24),
      )

      return {
        goodsId: g.id,
        engineNumber: g.unit.engineNumber,
        status: g.currentStatus,
        agingDays: days,
      }
    })
  }

  // ===============================
  // ALERTS
  // ===============================

  async getAlerts() {
    const now = Date.now()

    // 1️⃣ RECEIVED > 7 hari belum COMPLETED
    const received = await this.prisma.goods.findMany({
      where: {
        currentStatus: GoodsStatus.RECEIVED,
      },
      include: { unit: true },
    })

    const overduePhysicalBAST = received
      .map(g => {
        const days =
          (now - new Date(g.updatedAt).getTime()) /
          (1000 * 60 * 60 * 24)

        if (days > 7) {
          return {
            goodsId: g.id,
            engineNumber: g.unit.engineNumber,
            days: Math.floor(days),
          }
        }

        return null
      })
      .filter(Boolean)

    // 2️⃣ DELIVERED tapi belum RECEIVED
    const delivered = await this.prisma.goods.findMany({
      where: {
        currentStatus: GoodsStatus.DELIVERED,
      },
      include: { unit: true },
    })

    const awaitingReceiver = delivered.map(g => ({
      goodsId: g.id,
      engineNumber: g.unit.engineNumber,
    }))

    return {
      overduePhysicalBAST,
      awaitingReceiver,
    }
  }
}
