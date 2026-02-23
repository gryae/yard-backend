import { Injectable, BadRequestException } from '@nestjs/common'
import { GoodsStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class GoodsFlowService {

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  validateTransition(current: GoodsStatus, next: GoodsStatus) {

    const allowedTransitions: Record<GoodsStatus, GoodsStatus[]> = {
      INCOMING: [GoodsStatus.REPAIR, GoodsStatus.PDI],
      REPAIR: [GoodsStatus.PDI],
      PDI: [GoodsStatus.READY, GoodsStatus.REPAIR],
      READY: [GoodsStatus.DELIVERED],
      DELIVERED: [GoodsStatus.RECEIVED],
      RECEIVED: [GoodsStatus.COMPLETED],
      COMPLETED: [],
    }

    if (!allowedTransitions[current].includes(next)) {
      throw new BadRequestException(
        `Invalid transition from ${current} to ${next}`
      )
    }
  }

  async changeStatus(
    goodsId: string,
    userId: string,
    fromStatus: GoodsStatus,
    toStatus: GoodsStatus,
    action: string,
  ) {

    this.validateTransition(fromStatus, toStatus)

    await this.prisma.goods.update({
      where: { id: goodsId },
      data: {
        currentStatus: toStatus,
      },
    })

    await this.prisma.activityLog.create({
      data: {
        goodsId,
        userId,
        action,
        fromStatus,
        toStatus,
      },
    })

    return { message: `Status changed to ${toStatus}` }
  }
}
