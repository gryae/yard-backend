import {
  Controller,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
  Post,
  Get,
  Query,
  Res,
  Delete,
} from '@nestjs/common'
import { GoodsService } from './goods.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { GoodsStatus } from '@prisma/client'
import { BadRequestException } from '@nestjs/common'
import type { Response } from 'express'
import { StreamableFile } from '@nestjs/common'
import { Roles } from 'src/auth/roles.decorator'
import { RolesGuard } from 'src/auth/roles.guard'
import { Role } from '@prisma/client'

@Controller('goods')
export class GoodsController {
  constructor(private goodsService: GoodsService) {}

  @UseGuards(JwtAuthGuard)
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: GoodsStatus,
    @Request() req,
  ) {
    return this.goodsService.updateStatus(
      id,
      status,
      req.user.userId,
    )
  }


@UseGuards(JwtAuthGuard,RolesGuard)
@Roles(Role.ADMIN,Role.STAFF)
@Post('incoming')
async createIncoming(
  @Body()
  body: {
    engineNumber: string
    zone: string
    row: number
    lane: number
    inspectionItems: any
    photos: any[]
  },
  @Request() req,
) {

  if (!body.engineNumber) {
    throw new BadRequestException('Engine number is required')
  }

  if (!body.zone || body.row === undefined || body.lane === undefined) {
    throw new BadRequestException('Location data incomplete')
  }

  return this.goodsService.createIncoming(
    body.engineNumber.trim(),
    body.zone.trim(),
    Number(body.row),
    Number(body.lane),
    req.user.userId,
    body.inspectionItems || {},
    Array.isArray(body.photos) ? body.photos : [],
  )
}


  
@Post(':id/condition-check')
@UseGuards(JwtAuthGuard)
async conditionCheck(
  @Param('id') id: string,
  @Body() body: { checklist: any },
  @Request() req,
) {
  return this.goodsService.processConditionCheck(
    id,
    body.checklist,
    req.user.userId,
  )
}





@UseGuards(JwtAuthGuard,RolesGuard)
@Roles(Role.ADMIN,Role.STAFF)
@Post(':id/repair/start')
async startRepair(@Param('id') id: string, @Request() req) {
  return this.goodsService.startRepair(id, req.user.userId)
}

@UseGuards(JwtAuthGuard,RolesGuard)
@Roles(Role.ADMIN,Role.STAFF)
@Post(':id/repair/complete')
async completeRepair(
  @Param('id') id: string,
  @Request() req,
) {
  return this.goodsService.finishRepair(id, req.user.userId)
}

@UseGuards(JwtAuthGuard,RolesGuard)
@Roles(Role.ADMIN,Role.STAFF)
@Post(':id/repair/form')
async submitRepairForm(
  @Param('id') id: string,
  @Body('formData') formData: any,
  @Request() req,
) {
  return this.goodsService.submitRepairForm(
    id,
    formData,
    req.user.userId,
  )
}

@Get('scan/:qr')
async scan(@Param('qr') qr: string) {
  return this.goodsService.findByQr(qr)
}


@Get('print-qr')
@UseGuards(JwtAuthGuard)
async printMultipleQR(
  @Query('ids') ids: string,
) {
  const idArray = ids.split(',')

  const buffer = await this.goodsService.generateMultipleQR(idArray)

  return new StreamableFile(buffer, {
    type: 'application/pdf',
    disposition: 'attachment; filename=QR-BATCH.pdf',
  })
}

// @Post(':id/pdi/form')
// @UseGuards(JwtAuthGuard)
// async submitPDIForm(
//   @Param('id') id: string,
//   @Body('formData') formData: any,
//   @Request() req,
// ) {
//   return this.goodsService.submitPDIForm(
//     id,
//     formData,
//     req.user.userId,
//   )
// }


// @Post(':id/pdi/complete')
// @UseGuards(JwtAuthGuard)
// async completePDI(
//   @Param('id') id: string,
//   @Body() body: { result: string; stickerDate: string },
//   @Request() req,
// ) {
//   return this.goodsService.completePDI(
//     id,
//     body.result,
//     new Date(body.stickerDate),
//     req.user.userId,
//   )
// }


@UseGuards(JwtAuthGuard,RolesGuard)
@Roles(Role.ADMIN,Role.PDI)
@Post(':id/pdi')
async createPdi(
  @Param('id') id: string,
  @Body() body: any,
  @Request() req,
) {
  return this.goodsService.createPDI(
    id,
    body.items,
    body.technicianName,
    body.supervisorName,
    req.user.userId,
  )
}




@Patch(':id/complete')
@UseGuards(JwtAuthGuard)
async markCompleted(
  @Param('id') id: string,
  @Request() req,
) {
  return this.goodsService.markCompleted(id, req.user.userId)
}


@Patch(':id/move-location')
@UseGuards(JwtAuthGuard)
async moveLocation(
  @Param('id') id: string,
  @Body() body: { zone: string; row: number; lane: number },
  @Request() req,
) {
  return this.goodsService.moveLocation(
    id,
    body.zone,
    body.row,
    body.lane,
    req.user.userId,
  )
}

@Get('heatmap')
@UseGuards(JwtAuthGuard)
async heatmap() {
  return this.goodsService.getHeatmap()
}


@Get('monitoring/bast-aging')
@UseGuards(JwtAuthGuard)
async getBASTAging() {
  return this.goodsService.getBASTAging()
}


@Get('dashboard/summary')
@UseGuards(JwtAuthGuard)
async getDashboardSummary() {
  return this.goodsService.getDashboardSummary()
}

@Get('heatmap')
@UseGuards(JwtAuthGuard)
async getHeatmapData() {
  return this.goodsService.getHeatmapData()
}

@Get('dashboard/full')
@UseGuards(JwtAuthGuard)
async dashboardFull() {
  return this.goodsService.getDashboardFull()
}

@Get(':id/detail')
@UseGuards(JwtAuthGuard)
async getDetail(@Param('id') id: string) {
  return this.goodsService.getGoodsDetail(id)
}


@UseGuards(JwtAuthGuard)
@Patch(':id/relocate')
async relocate(
  @Param('id') id: string,
  @Body() body: { zone: string; row: number; lane: number },
  @Request() req,
) {
  // console.log('req user',req.user)
  return this.goodsService.relocate(
    id,
    body.zone,
    body.row,
    body.lane,
    req.user.userId,
  )
}

@UseGuards(JwtAuthGuard)
@Get()
async getGoods(@Query('status') status?: string) {
  return this.goodsService.getGoods(status)
}


@Get(':id/incoming-pdf')
async downloadIncomingPdf(
  @Param('id') goodsId: string,
) {
  const pdfBuffer =
    await this.goodsService.generateIncomingPdf(goodsId)

  return new StreamableFile(pdfBuffer, {
    type: 'application/pdf',
    disposition: `attachment; filename=Incoming-${goodsId}.pdf`,
  })
}

// @Get(':id/pdi/print')
// @UseGuards(JwtAuthGuard)
// async printPDI(
//   @Param('id') id: string,
//   @Res() res: Response,
// ) {
//   return this.goodsService.generatePDIPDF(id, res)
// }
@Get(':id/pdi/print')
@UseGuards(JwtAuthGuard)
async printPDI(
  @Param('id') id: string,
) {
  const buffer = await this.goodsService.generatePDIPDF(id)

  return new StreamableFile(buffer, {
    type: 'application/pdf',
    disposition: `inline; filename=PDI-${id}.pdf`,
  })
}

// @Get('export/full-backup')
// @UseGuards(JwtAuthGuard)
// async exportFullBackup() {

//   const buffer = await this.goodsService.exportFullBackup()

//   return new StreamableFile(buffer, {
//     type: 'application/zip',
//     disposition: 'attachment; filename=YARD-FULL-BACKUP.zip',
//   })
// }

@Get('export/full-backup')
@UseGuards(JwtAuthGuard)
async exportFullBackup(@Res() res: any) {
  return this.goodsService.exportFullBackup(res)
}

@Get(':id/repair/print')
@UseGuards(JwtAuthGuard)
async printRepair(
  @Param('id') id: string,
) {
  const buffer = await this.goodsService.generateRepairPDF(id)

  return new StreamableFile(buffer, {
    type: 'application/pdf',
    disposition: `inline; filename=REPAIR-${id}.pdf`,
  })
}



// HARD DELETE (READY / REPAIR)
@UseGuards(JwtAuthGuard,RolesGuard)
@Roles(Role.ADMIN)
@Delete(':id')
async hardDeleteGoods(
  @Param('id') id: string,
  @Request() req,
) {
  return this.goodsService.hardDeleteGoods(
    id,
    req.user.userId,
  );
}


// ROLLBACK DELIVERY (DELIVERED → READY)
@UseGuards(JwtAuthGuard,RolesGuard)
@Roles(Role.ADMIN)
@Post(':id/rollback-delivery')
async rollbackDelivery(
  @Param('id') id: string,
  @Request() req,
) {
  return this.goodsService.rollbackDelivery(
    id,
    req.user.userId,
  );
}

}
