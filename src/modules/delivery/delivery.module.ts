import { Module } from '@nestjs/common'
import { DeliveryService } from './delivery.service'
import { DeliveryController } from './delivery.controller'
import { PrismaModule } from '../../prisma/prisma.module'
import { GoodsModule } from 'src/goods/goods.module'

@Module({
  imports: [PrismaModule, GoodsModule],
  controllers: [DeliveryController],
  providers: [DeliveryService],
})
export class DeliveryModule {}
