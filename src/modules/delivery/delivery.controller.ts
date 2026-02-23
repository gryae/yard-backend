import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Get,
  Param,
  Res,
  Query,
  Patch,
  Request
} from '@nestjs/common'
import type { Response } from 'express'
import { DeliveryService } from './delivery.service'
import { JwtAuthGuard } from '../../auth/jwt-auth.guard'
import { RolesGuard } from '../../auth/roles.guard'
import { Roles } from '../../auth/roles.decorator'
import { Role } from '@prisma/client'

@Controller('delivery')
export class DeliveryController {
  constructor(private service: DeliveryService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @Post('create')
  async createDelivery(
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.service.createMultiDelivery(
      body,
      req.user.userId,
    )
  }



  @Get(':id/print')
async printSuratJalan(
  @Param('id') id: string,
  @Res() res: Response,
) {
  return this.service.generatePDF(id, res)
}

@Post(':goodsId/verify')
async verify(
  @Param('goodsId') goodsId: string,
  @Body() body: { token: string; verificationCode: string },
) {
  return this.service.verifyDeliveryToken(
    goodsId,
    body.token,
    body.verificationCode,
  )
}

@Post(':goodsId/receive')
async receive(
  @Param('goodsId') goodsId: string,
  @Body() body: { receiverName: string },
) {
  return this.service.finalizeReceiving(
    goodsId,
    body.receiverName,
  )
}


@Get('bast/:goodsId/print')
async printBAST(
  @Param('goodsId') goodsId: string,
  @Query('token') token: string,
  @Res() res: Response,
) {
  return this.service.generateBAST(goodsId, token, res)
}



@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.STAFF)
@Post(':goodsId/unlock-token')
async unlockToken(
  @Param('goodsId') goodsId: string,
) {
  return this.service.unlockToken(goodsId)
}


@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.STAFF)
@Get(':id')
async getDeliveryDetail(@Param('id') id: string) {
  return this.service.getDeliveryDetail(id)
}


@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.STAFF)
@Get('by-goods/:goodsId')
async getByGoods(@Param('goodsId') goodsId: string) {
  return this.service.getDeliveryByGoods(goodsId)
}

@Patch(':id/complete')
@UseGuards(JwtAuthGuard)
async markCompleted(
  @Param('id') id: string,
  @Request() req,
) {
  return this.service.markCompleted(id, req.user.userId)
}

}
