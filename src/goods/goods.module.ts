import { Module } from '@nestjs/common'
import { GoodsService } from './goods.service'
import { GoodsController } from './goods.controller'
import { PrismaService } from '../prisma/prisma.service'
import { GoodsFlowService } from './goods-flow.service'

@Module({
  controllers: [GoodsController],
  providers: [GoodsService, GoodsFlowService, PrismaService],
  exports: [ GoodsFlowService],
})
export class GoodsModule {}
