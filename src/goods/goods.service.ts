import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { GoodsFlowService } from './goods-flow.service'
import { GoodsStatus, Role } from '@prisma/client'
import { BadRequestException } from '@nestjs/common/exceptions'
import QRCode from 'qrcode'
import {v4 as uuid} from 'uuid'
import PDFDocument from 'pdfkit'
import { PassThrough } from 'stream'
import { randomUUID } from 'crypto'
import * as path from 'path'
import * as fs from 'fs'
import { PDFDocument as PDFDocument1, StandardFonts, rgb } from 'pdf-lib'
import cloudinary from '../config/cloudinary'


@Injectable()
export class GoodsService {
  constructor(
    private prisma: PrismaService,
    private flow: GoodsFlowService,
  ) {}

  async updateStatus(
    goodsId: string,
    nextStatus: GoodsStatus,
    userId: string,
  ) {
    const goods = await this.prisma.goods.findUnique({
      where: { id: goodsId },
    })

    if (!goods) {
      throw new NotFoundException('Goods not found')
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    // 🔐 Role Restriction
    this.validateRole(user.role, nextStatus)

    // 🧠 Flow Validation
    this.flow.validateTransition(goods.currentStatus, nextStatus)

    const updated = await this.prisma.goods.update({
      where: { id: goodsId },
      data: { currentStatus: nextStatus },
    })

    // 📝 Auto Log
    await this.prisma.activityLog.create({
      data: {
        goodsId,
        userId,
        action: 'STATUS_CHANGE',
        fromStatus: goods.currentStatus,
        toStatus: nextStatus,
      },
    })

    return updated
  }

  private validateRole(role: Role, nextStatus: GoodsStatus) {
    if (role === Role.ADMIN) return

    if (role === Role.STAFF) {
      if (
        nextStatus === GoodsStatus.INCOMING ||
        nextStatus === GoodsStatus.REPAIR
      ) {
        return
      }
    }

    if (role === Role.PDI) {
      if (nextStatus === GoodsStatus.PDI || nextStatus === GoodsStatus.READY) {
        return
      }
    }

    if (role === Role.GLOBAL) {
      if (nextStatus === GoodsStatus.COMPLETED) {
        return
      }
    }

    throw new ForbiddenException('Role not allowed to perform this action')
  }

async createIncoming(
  engineNumber: string,
  zone: string,
  row: number,
  lane: number,
  userId: string,
  // conditionChecks: any,
  inspectionItems: any[],
  photos: any[],
) {

  return this.prisma.$transaction(async (tx) => {

    // ===============================
    // 1️⃣ Validate Unit
    // ===============================
    const unit = await tx.unitMaster.findUnique({
      where: { engineNumber },
    })

    if (!unit) {
      throw new NotFoundException('Unit not found in Master Data')
    }

    const existingGoods = await tx.goods.findUnique({
      where: { unitId: unit.id },
    })

    if (existingGoods) {
      throw new BadRequestException('Unit already has Goods record')
    }

    // ===============================
    // 2️⃣ Validate Location
    // ===============================
    const location = await tx.location.findUnique({
      where: {
        zone_row_lane: {
          zone,
          row,
          lane,
        },
      },
    })

    if (!location) {
      throw new NotFoundException('Location not found')
    }

    if (!location.isActive) {
      throw new BadRequestException('Location is not active')
    }

    const occupied = await tx.goods.findFirst({
      where: { locationId: location.id },
    })

    if (occupied) {
      throw new BadRequestException('Location already occupied')
    }

    // ===============================
    // 3️⃣ Determine Status Safely
    // ===============================

    const inspectionData = inspectionItems || []

    const itemsArray = Array.isArray(inspectionData)
    ? inspectionData
    : Object.values(inspectionData || {})
    

    console.log('inspection data : ',inspectionData)
    console.log('itemsArray :',itemsArray)

    const hasIssue = itemsArray.some(
      (item) => item.status === 'NOT_OK')

    const nextStatus = hasIssue
    ? GoodsStatus.REPAIR
    : GoodsStatus.INCOMING

    console.log(hasIssue);
    console.log(nextStatus);
    // const safeChecks = conditionChecks || {}

    // const hasIssue = Object.values(safeChecks).some(
    //   (v) => v === false,
    // )

    // const nextStatus = hasIssue
    //   ? GoodsStatus.REPAIR
    //   : GoodsStatus.INCOMING

    // ===============================
    // 4️⃣ Generate QR (collision-safe)
    // ===============================
    const qrContent = `GOODS-${unit.id}-${randomUUID()}`

    // ===============================
    // 5️⃣ Create Goods
    // ===============================
    const goods = await tx.goods.create({
      data: {
        unitId: unit.id,
        qrCode: qrContent,
        currentStatus: nextStatus,
        locationId: location.id,
        incomingDate: new Date(),
      },
    })


    // Auto Create Repair Record
if (hasIssue) {

  // 1️⃣ create repair record
  await tx.repairRecord.create({
    data: {
      goodsId: goods.id,
      startDate: new Date(),
    },
  })

  // 2️⃣ create activity log
  await tx.activityLog.create({
    data: {
      goodsId: goods.id,
      userId,
      action: 'REPAIR_STARTED',
    },
  })
}

    // ===============================
    // 6️⃣ Save Incoming Form
    // ===============================
    // await tx.incomingForm.create({
    //   data: {
    //     goodsId: goods.id,
    //     ...safeChecks,
    //     hasIssue,
    //   },
    // })

    const form = await tx.incomingForm.create({
      data: {
        goodsId: goods.id,
        hasIssue
      }
    })


    if (inspectionData.length > 0) {
  await tx.incomingInspectionItem.createMany({
    data: inspectionData.map((item) => ({
      formId: form.id,
      category: item.category,
      itemName: item.itemName,
      status: item.status,
      source: item.source,
      note: item.note,
    })),
  })
}

    // ===============================
    // 7️⃣ Save Photos Metadata (Safe BASE_URL)
    // ===============================
    if (photos?.length) {

      const baseUrl =
        process.env.BASE_URL || 'http://localhost:3001'

      await tx.photo.createMany({
        data: photos.map((p) => ({
          goodsId: goods.id,
          process: 'INCOMING',
          filename: p.filename,
          path: `/uploads/incoming/${p.filename}`,
          url: `${baseUrl}/uploads/incoming/${p.filename}`,
        })),
      })
    }

    // ===============================
    // 8️⃣ Activity Log
    // ===============================
    await tx.activityLog.create({
      data: {
        goodsId: goods.id,
        userId,
        action: 'CREATE_INCOMING',
        toStatus: nextStatus,
      },
    })

    // ===============================
    // 9️⃣ Generate QR Image
    // ===============================
    const qrImage = await QRCode.toDataURL(qrContent)

    return {
      goods,
      qrImage,
      autoRepair: hasIssue,
      nextStatus,
    }
  })
}



async processConditionCheck(
  goodsId: string,
  checklist: any,
  userId: string,
) {
  const goods = await this.prisma.goods.findUnique({
    where: { id: goodsId },
  })

  if (!goods) {
    throw new NotFoundException('Goods not found')
  }

  if (goods.currentStatus !== 'INCOMING') {
    throw new BadRequestException('Condition check only allowed at INCOMING stage')
  }

  // 🧠 Tentukan hasil otomatis
  const allYes = Object.values(checklist).every(
    (value) => value === true || value === 'YES'
  )

  const result = allYes ? 'GOOD' : 'REPAIR'
  const nextStatus = allYes ? 'PDI' : 'REPAIR'

  // 📝 Save ConditionCheck
  await this.prisma.conditionCheck.create({
    data: {
      goodsId,
      checklist,
      result,
    },
  })

  // 🔁 Update Status via Flow Engine
  this.flow.validateTransition(goods.currentStatus, nextStatus as any)

  await this.prisma.goods.update({
    where: { id: goodsId },
    data: { currentStatus: nextStatus as any },
  })

  // 🧾 Log Activity
  await this.prisma.activityLog.create({
    data: {
      goodsId,
      userId,
      action: 'CONDITION_CHECK',
      fromStatus: goods.currentStatus,
      toStatus: nextStatus,
    },
  })

  return {
    result,
    nextStatus,
  }
}

async startRepair(goodsId: string, userId: string) {
  const goods = await this.prisma.goods.findUnique({
    where: { id: goodsId },
  })

  if (!goods) throw new NotFoundException('Goods not found')

  if (goods.currentStatus !== 'REPAIR') {
    throw new BadRequestException('Repair only allowed when status is REPAIR')
  }

  const repair = await this.prisma.repairRecord.create({
    data: {
      goodsId,
      startDate: new Date(),
    },
  })

  await this.prisma.activityLog.create({
    data: {
      goodsId,
      userId,
      action: 'REPAIR_STARTED',
    },
  })

  return repair
}

async finishRepair(goodsId: string, userId: string) {
  const goods = await this.prisma.goods.findUnique({
    where: { id: goodsId },
  })

  if (!goods) throw new NotFoundException('Goods not found')

  const repair = await this.prisma.repairRecord.findFirst({
    where: {
      goodsId,
      endDate: null,
    },
  })

  if (!repair) {
    throw new BadRequestException('No active repair found')
  }

  if (!repair.formData) {
    throw new BadRequestException('Repair form not submitted')
  }

  const repairPhotos = await this.prisma.photo.count({
    where: {
      goodsId,
      process: 'REPAIR',
    },
  })

  if (repairPhotos === 0) {
    throw new BadRequestException('Repair photos required')
  }

  await this.prisma.repairRecord.update({
    where: { id: repair.id },
    data: {
      endDate: new Date(),
      isCompleted: true,
      result: 'GOOD',
    },
  })

  await this.prisma.goods.update({
    where: { id: goodsId },
    data: {
      currentStatus: 'INCOMING',
    },
  })

  await this.prisma.activityLog.create({
    data: {
      goodsId,
      userId,
      action: 'REPAIR_COMPLETED',
      fromStatus: 'REPAIR',
      toStatus: 'INCOMING',
    },
  })

  return { message: 'Repair completed and moved to PDI' }
}


async submitRepairForm(
  goodsId: string,
  formData: any,    
  userId: string,
) {
  const repair = await this.prisma.repairRecord.findFirst({
    where: {
      goodsId,
      endDate: null,
    },
  })

  if (!repair) {
    throw new BadRequestException('No active repair found')
  }

  await this.prisma.repairRecord.update({
    where: { id: repair.id },
    data: {
      formData,
    },
  })

  await this.prisma.activityLog.create({
    data: {
      goodsId,
      userId,
      action: 'REPAIR_FORM_SUBMITTED',
    },
  })

  return { message: 'Repair form saved' }
}

async findByQr(qrCode: string) {
  return this.prisma.goods.findUnique({
    where: { qrCode },
    include: {
      logs:{
        include:{user:true},
        orderBy:{createdAt: 'desc'},
      },
      unit: true,
      location:true,
    },
  })
}


async generateMultipleQR(ids: string[]) {
  const goodsList = await this.prisma.goods.findMany({
    where: { id: { in: ids } },
    include: {
      unit: true,
    },
  })

  const pdfDoc = await PDFDocument1.create()
  // Load font lebih variatif
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)

  for (const g of goodsList) {
    const page = pdfDoc.addPage([595, 842]) // A4
    const { width, height } = page.getSize()

    // 1. BACKGROUND FRAME (Biar kayak stiker label)
    const cardWidth = 450
    const cardHeight = 550
    const cardX = (width - cardWidth) / 2
    const cardY = (height - cardHeight) / 2

    // Gambar Border Luar
    page.drawRectangle({
      x: cardX,
      y: cardY,
      width: cardWidth,
      height: cardHeight,
      borderWidth: 2,
      borderColor: rgb(0.1, 0.1, 0.1),
      color: rgb(1, 1, 1), // Background putih bersih
    })

    // 2. HEADER LABEL
    page.drawRectangle({
      x: cardX,
      y: cardY + cardHeight - 40,
      width: cardWidth,
      height: 40,
      color: rgb(0.1, 0.1, 0.1), // Header Hitam/Gelap
    })

    page.drawText('YARD SYSTEM - UNIT IDENTIFICATION', {
      x: cardX + 20,
      y: cardY + cardHeight - 25,
      size: 14,
      font: fontBold,
      color: rgb(1, 1, 1),
    })

    // 3. QR CODE (Kita taruh di tengah atas)
    const qrData = await QRCode.toDataURL(g.qrCode, {
      margin: 1,
      scale: 10,
    })
    const qrImageBytes = Buffer.from(
      qrData.replace(/^data:image\/png;base64,/, ''),
      'base64'
    )
    const qrImage = await pdfDoc.embedPng(qrImageBytes)
    
    const qrSize = 250
    page.drawImage(qrImage, {
      x: width / 2 - qrSize / 2,
      y: cardY + 230,
      width: qrSize,
      height: qrSize,
    })

    // 4. UNIT INFORMATION (Bawah QR)
    const infoYStart = cardY + 200
    
    // Fungsi pembantu biar gak nulis berulang
    const drawInfo = (label: string, value: string, y: number) => {
      page.drawText(label, {
        x: cardX + 30,
        y,
        size: 10,
        font: fontBold,
        color: rgb(0.4, 0.4, 0.4),
      })
      page.drawText(value || '-', {
        x: cardX + 30,
        y: y - 18,
        size: 18,
        font: fontBold,
        color: rgb(0, 0, 0),
      })
      // Garis pemisah tipis
      page.drawLine({
        start: { x: cardX + 30, y: y - 25 },
        end: { x: cardX + cardWidth - 30, y: y - 25 },
        thickness: 1,
        color: rgb(0.9, 0.9, 0.9),
      })
    }

    drawInfo('ENGINE NUMBER', g.unit.engineNumber, infoYStart)
    drawInfo('CHASSIS NUMBER', g.unit.chassisNumber, infoYStart - 60)
    
    // Info tambahan di baris bawah (Grid style)
    page.drawText('INCOMING DATE', {
      x: cardX + 30,
      y: infoYStart - 120,
      size: 10,
      font: fontBold,
      color: rgb(0.4, 0.4, 0.4),
    })
    page.drawText(g.incomingDate?.toLocaleDateString("YYYY-MM-DD hh:mm:ss") ? String(g.incomingDate.toLocaleDateString("YYYY-MM-DD hh:mm:ss")) : '-', {
      x: cardX + 30,
      y: infoYStart - 135,
      size: 14,
      font: fontRegular,
    })

    page.drawText('GENERATE TIME', {
      x: cardX + 250,
      y: infoYStart - 120,
      size: 10,
      font: fontBold,
      color: rgb(0.4, 0.4, 0.4),
    })
    page.drawText(new Date().toLocaleDateString('id-ID'), {
      x: cardX + 250,
      y: infoYStart - 135,
      size: 14,
      font: fontRegular,
    })

    // Footer Kecil
    page.drawText(`ID: ${g.id}`, {
      x: cardX + 30,
      y: cardY + 15,
      size: 8,
      font: fontRegular,
      color: rgb(0.6, 0.6, 0.6),
    })
  }

  const pdfBytes = await pdfDoc.save()
  return Buffer.from(pdfBytes)
}

// async submitPDIForm(
//   goodsId: string,
//   formData: any,
//   userId: string,
// ) {
//   const goods = await this.prisma.goods.findUnique({
//     where: { id: goodsId },
//   })

//   if (!goods) throw new NotFoundException('Goods not found')

//   if (goods.currentStatus !== 'INCOMING' && goods.currentStatus !== 'REPAIR') {
//     throw new BadRequestException('PDI only allowed at INCOMING & REPAIR stage')
//   }

//   const pdi = await this.prisma.pDIRecord.create({
//     data: {
//       goodsId,
//       formData,
//     },
//   })

//   await this.prisma.activityLog.create({
//     data: {
//       goodsId,
//       userId,
//       action: 'PDI_FORM_SUBMITTED',
//     },
//   })

//   return pdi
// }

// async completePDI(
//   goodsId: string,
//   result: string,
//   stickerDate: Date,
//   userId: string,
// ) {
//   return this.prisma.$transaction(async (tx) => {

//     const goods = await tx.goods.findUnique({
//       where: { id: goodsId },
//     })

//     if (!goods)
//       throw new NotFoundException('Goods not found')

//     // ✅ FIXED CONDITION
//     if (
//       goods.currentStatus !== 'INCOMING' &&
//       goods.currentStatus !== 'REPAIR'
//     ) {
//       throw new BadRequestException(
//         'PDI only allowed at INCOMING & REPAIR stage',
//       )
//     }

//     const pdi = await tx.pDIRecord.findFirst({
//       where: {
//         goodsId,
//         isCompleted: false,
//       },
//     })

//     if (!pdi)
//       throw new BadRequestException(
//         'PDI form not submitted',
//       )

//     const pdiPhotos = await tx.photo.count({
//       where: {
//         goodsId,
//         process: 'PDI',
//       },
//     })

//     if (pdiPhotos === 0)
//       throw new BadRequestException(
//         'PDI photos required',
//       )

//     // ✅ Complete PDI Record
//     await tx.pDIRecord.update({
//       where: { id: pdi.id },
//       data: {
//         result,
//         stickerDate,
//         isCompleted: true,
//       },
//     })

//     let nextStatus: any = 'READY'

//     if (result === 'NOT_GOOD') {
//       nextStatus = 'REPAIR'

//       // ✅ Auto create repair record
//       await tx.repairRecord.create({
//         data: {
//           goodsId,
//           startDate: new Date(),
//         },
//       })

//       await tx.activityLog.create({
//         data: {
//           goodsId,
//           userId,
//           action: 'REPAIR_STARTED',
//           fromStatus: goods.currentStatus,
//           toStatus: 'REPAIR',
//         },
//       })
//     }

//     // ✅ Update goods status
//     await tx.goods.update({
//       where: { id: goodsId },
//       data: {
//         currentStatus: nextStatus,
//       },
//     })

//     // ✅ Log PDI completed
//     await tx.activityLog.create({
//       data: {
//         goodsId,
//         userId,
//         action: 'PDI_COMPLETED',
//         fromStatus: goods.currentStatus,
//         toStatus: nextStatus,
//       },
//     })

//     return { message: `Moved to ${nextStatus}` }
//   })
// }

async createPDI(
  goodsId: string,
  items: any[],
  technicianName: string,
  supervisorName: string,
  userId: string,
) {
  return this.prisma.$transaction(async (tx) => {

    // =========================
    // 1️⃣ Validate Goods
    // =========================
    const goods = await tx.goods.findUnique({
      where: { id: goodsId },
    })

    if (!goods)
      throw new NotFoundException('Goods not found')

    if (
      goods.currentStatus !== 'INCOMING' &&
      goods.currentStatus !== 'REPAIR'
    ) {
      throw new BadRequestException(
        'PDI only allowed at INCOMING & REPAIR stage',
      )
    }

    // =========================
    // 2️⃣ Validate Photos
    // =========================
    const photoCount = await tx.photo.count({
      where: {
        goodsId,
        process: 'PDI',
      },
    })

    const stickerPhoto = await tx.photo.count({
  where: {
    goodsId,
    process: 'PDI_STICKER',
  },
})



    if (photoCount === 0) {
      throw new BadRequestException(
        'PDI photos required before submit',
      )
    }

    if (stickerPhoto === 0) {
  throw new BadRequestException('Sticker photo required')
}

    // =========================
    // 3️⃣ Detect NG
    // =========================
    const hasNG = items.some(
      (item) => item.status === 'NG',
    )

    const nextStatus = hasNG
      ? 'REPAIR'
      : 'READY'

    // =========================
    // 4️⃣ Create PDI Record
    // =========================
    const record = await tx.pDIRecord.create({
      data: {
        goodsId,
        technicianName,
        supervisorName,
        stickerDate: new Date(),
        items: {
          create: items.map((item) => ({
            category: item.category,
            itemName: item.itemName,
            status: item.status,
            note: item.note || null,
          })),
        },
      },
      include: {
        items: true,
      },
    })

    // =========================
    // 5️⃣ Auto Repair
    // =========================
    if (hasNG) {

      await tx.repairRecord.create({
        data: {
          goodsId,
          startDate: new Date(),
        },
      })

      await tx.activityLog.create({
        data: {
          goodsId,
          userId,
          action: 'REPAIR_STARTED',
          fromStatus: goods.currentStatus,
          toStatus: 'REPAIR',
        },
      })
    }

    // =========================
    // 6️⃣ Update Goods Status
    // =========================
    await tx.goods.update({
      where: { id: goodsId },
      data: {
        currentStatus: nextStatus,
      },
    })

    // =========================
    // 7️⃣ Activity Log PDI
    // =========================
    await tx.activityLog.create({
      data: {
        goodsId,
        userId,
        action: 'PDI_COMPLETED',
        fromStatus: goods.currentStatus,
        toStatus: nextStatus,
      },
    })

    return {
      message: `Moved to ${nextStatus}`,
      record,
      hasNG,
    }
  })
}

async markCompleted(id: string, userId: string) {

  const goods = await this.prisma.goods.findUnique({
    where: { id },
  })

  if (!goods) {
    throw new BadRequestException('Goods not found')
  }

  if (goods.currentStatus !== GoodsStatus.RECEIVED) {
    throw new BadRequestException('Goods not in RECEIVED status')
  }

  return this.flow.changeStatus(
    id,
    userId,
    GoodsStatus.RECEIVED,
    GoodsStatus.COMPLETED,
    'BAST_PHYSICAL_RECEIVED',
  )
}


async moveLocation(
  goodsId: string,
  zone: string,
  row: number,
  lane: number,
  userId: string,
) {
  const goods = await this.prisma.goods.findUnique({
    where: { id: goodsId },
  })

  if (!goods) {
    throw new NotFoundException('Goods not found')
  }

  const location = await this.prisma.location.findUnique({
    where: {
      zone_row_lane: { zone, row, lane },
    },
  })

  if (!location || !location.isActive) {
    throw new BadRequestException('Invalid location')
  }

  const occupied = await this.prisma.goods.findFirst({
    where: { locationId: location.id },
  })

  if (occupied) {
    throw new BadRequestException('Location already occupied')
  }

  await this.prisma.goods.update({
    where: { id: goodsId },
    data: {
      locationId: location.id,
    },
  })

  await this.prisma.activityLog.create({
    data: {
      goodsId,
      userId,
      action: 'LOCATION_MOVED',
    },
  })

  return { message: 'Location updated successfully' }
}


async getHeatmap() {

  // 1️⃣ Ambil semua location + goods
  const locations = await this.prisma.location.findMany({
    include: {
      goods: {
        include: {
          unit: true,
        },
      },
    },
    orderBy: [
      { zone: 'asc' },
      { row: 'asc' },
      { lane: 'asc' },
    ],
  })

  // 2️⃣ Ambil semua goods aktif untuk FIFO
  const activeGoods = await this.prisma.goods.findMany({
    where: {
      currentStatus: {
        notIn: ['DELIVERED', 'RECEIVED', 'COMPLETED'],
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  })

  // 3️⃣ Buat FIFO Map
  const fifoMap = new Map<string, number>()

  activeGoods.forEach((g, index) => {
    fifoMap.set(g.id, index + 1)
  })

  const today = new Date()

  // 4️⃣ Format response
  return locations.map(loc => {

    if (!loc.goods) {
      return {
        zone: loc.zone,
        row: loc.row,
        lane: loc.lane,
        isActive: loc.isActive,
        goods: null,
      }
    }

    const fifoRank = fifoMap.get(loc.goods.id) || null

    const aging = Math.floor(
      (today.getTime() - loc.goods.createdAt.getTime()) /
      (1000 * 60 * 60 * 24)
    )

    return {
      zone: loc.zone,
      row: loc.row,
      lane: loc.lane,
      isActive: loc.isActive,
      goods: {
        id: loc.goods.id,
        status: loc.goods.currentStatus,
        fifoRank,
        aging,
        brand: loc.goods.unit.brand,
        engineNumber: loc.goods.unit.engineNumber,
        chassisNumber: loc.goods.unit.chassisNumber,
      },
    }
  })
}


async getBASTAging() {

  const goodsList = await this.prisma.goods.findMany({
    where: {
      currentStatus: 'RECEIVED',
    },
    include: {
      unit: true,
      bast: true,
    },
  })

  const today = new Date()

  return goodsList.map(g => {

    const receivedDate = g.bast?.completedAt
    let aging = 0
    let isOverdue = false

    if (receivedDate) {
      aging = Math.floor(
        (today.getTime() - new Date(receivedDate).getTime()) /
        (1000 * 60 * 60 * 24)
      )

      isOverdue = aging > 7
    }

    return {
      id: g.id,
      engineNumber: g.unit.engineNumber,
      chassisNumber: g.unit.chassisNumber,
      receiverName: g.bast?.receiverName,
      receivedDate,
      aging,
      isOverdue,
    }
  })
}

async getDashboardSummary() {

  const total = await this.prisma.goods.count()

  const grouped = await this.prisma.goods.groupBy({
    by: ['currentStatus'],
    _count: true,
  })

  const statusMap: any = {}

  grouped.forEach(g => {
    statusMap[g.currentStatus] = g._count
  })

  // 🔴 BAST OVERDUE
  const receivedGoods = await this.prisma.goods.findMany({
    where: {
      currentStatus: 'RECEIVED',
    },
    include: {
      bast: true,
    },
  })

  const today = new Date()

  const overdue = receivedGoods.filter(g => {
    if (!g.bast?.completedAt) return false

    const aging =
      (today.getTime() - new Date(g.bast.completedAt).getTime()) /
      (1000 * 60 * 60 * 24)

    return aging > 7
  }).length

  return {
    total,
    INCOMING: statusMap.INCOMING || 0,
    REPAIR: statusMap.REPAIR || 0,
    PDI: statusMap.PDI || 0,
    READY: statusMap.READY || 0,
    DELIVERED: statusMap.DELIVERED || 0,
    RECEIVED: statusMap.RECEIVED || 0,
    COMPLETED: statusMap.COMPLETED || 0,
    BAST_OVERDUE: overdue,
  }
}

async getHeatmapData() {

  const goods = await this.prisma.goods.findMany({
    include: {
      location: true,
      unit: true,
    },
  })

  const sorted = [...goods].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() -
      new Date(b.createdAt).getTime()
  )

  const total = sorted.length || 1

  return sorted.map((g, index) => {

    const ratio = index / total
    const greenBlue = Math.floor(255 * ratio)

    const color = `rgb(255, ${greenBlue}, ${greenBlue})`

    return {
      id: g.id,
      zone: g.location?.zone,
      row: g.location?.row,
      lane: g.location?.lane,
      status: g.currentStatus,
      brand: g.unit?.brand,
      engineNumber: g.unit?.engineNumber,
      chassisNumber: g.unit?.chassisNumber,
      color,
      isVeryOld: ratio < 0.2,
    }
  })
}

async getDashboardFull() {

  // =========================
  // SUMMARY COUNT PER STATUS
  // =========================

  const allGoods = await this.prisma.goods.findMany({
    include: {
      unit: true,
      location: true,
    },
  })

  const summary = {
    total: allGoods.length,
    INCOMING: 0,
    REPAIR: 0,
    PDI: 0,
    READY: 0,
    DELIVERED: 0,
    RECEIVED: 0,
    COMPLETED: 0,
    BAST_OVERDUE: 0,
  }

  const now = new Date()

  for (const g of allGoods) {

    summary[g.currentStatus]++

    // BAST Overdue = RECEIVED > 7 hari belum COMPLETED
    if (g.currentStatus === 'RECEIVED') {
      const days =
        Math.floor(
          (now.getTime() - g.updatedAt.getTime()) /
          (1000 * 60 * 60 * 24)
        )

      if (days > 7) {
        summary.BAST_OVERDUE++
      }
    }
  }

  // =========================
  // MASTER VS INCOMING
  // =========================

  const masterTotal = await this.prisma.unitMaster.count()

  const everIncoming = await this.prisma.goods.count({
    where:{
        id: { not : ""}
    }
  })

const neverIncoming = masterTotal - everIncoming


  const incomingTotal = summary.INCOMING

  // =========================
  // GOODS TABLE DATA
  // =========================

  const goods = allGoods.map((g) => {

    const daysInYard =
      Math.floor(
        (now.getTime() - g.createdAt.getTime()) /
        (1000 * 60 * 60 * 24)
      )

    return {
      id: g.id,
      engineNumber: g.unit?.engineNumber,
      chassisNumber: g.unit?.chassisNumber,
      currentStatus: g.currentStatus,
      zone: g.location?.zone || '-',
      row: g.location?.row || '-',
      lane: g.location?.lane || '-',
      daysInYard,
      blNumber: g.unit?.blNumber,
    }
  })

  return {
    summary,
    masterTotal,
    incomingTotal,
    goods,
    everIncoming,
    neverIncoming
  }
}


async getGoodsDetail(goodsId: string) {

  const goods = await this.prisma.goods.findUnique({
    where: { id: goodsId },
    include: {
      unit: true,
      location: true,
      photos: true,
      logs: {
        orderBy: { createdAt: 'desc' },
        include: {
          user: true,
        },
      },
    },
  })

  if (!goods) {
    throw new NotFoundException('Goods not found')
  }

  // Group photos by process
  const groupedPhotos: Record<string, any[]> = {}

  for (const photo of goods.photos) {
    if (!groupedPhotos[photo.process]) {
      groupedPhotos[photo.process] = []
    }
    groupedPhotos[photo.process].push(photo)
  }

  return {
    id: goods.id,
    engineNumber: goods.unit?.engineNumber,
    chassisNumber: goods.unit?.chassisNumber,
    currentStatus: goods.currentStatus,
    location: goods.location,
    logs: goods.logs,
    photos: groupedPhotos,
    qrImage: goods.qrCode,
    incomingDate: goods.incomingDate,
  }
}


async relocate(
  goodsId: string,
  zone: string,
  row: number,
  lane: number,
  userId: string,
) {

  // 1️⃣ Cari goods + lokasi lama
  const goods = await this.prisma.goods.findUnique({
    where: { id: goodsId },
    include: {
      location: true,
    },
  })

  if (!goods) {
    throw new NotFoundException('Goods not found')
  }

  const oldLocation = goods.location
    ? `${goods.location.zone}-${goods.location.row}-${goods.location.lane}`
    : 'NO LOCATION'

  // 2️⃣ Cari target location
  const targetLocation = await this.prisma.location.findUnique({
    where: {
      zone_row_lane: {
        zone,
        row,
        lane,
      },
    },
    include: {
      goods: true,
    },
  })

  if (!targetLocation) {
    throw new NotFoundException('Location not found')
  }

  if (targetLocation.goods) {
    throw new BadRequestException('Location already occupied')
  }

  // 3️⃣ Update goods → pindahkan locationId
  await this.prisma.goods.update({
    where: { id: goodsId },
    data: {
      locationId: targetLocation.id,
    },
  })

  const newLocation = `${zone}-${row}-${lane}`

  // 4️⃣ Activity log
  await this.prisma.activityLog.create({
    data: {
      goodsId,
      action: 'RELOCATE',
      fromStatus: `Relocate from ${oldLocation} `,
      toStatus: `To → ${newLocation}`,
      userId,
    },
  })

  return {
    message: 'Relocation success',
  }
}


async getGoods(status?: string) {

  return this.prisma.goods.findMany({
    where: {
      ...(status && { currentStatus: status as any }),
    },
    include: {
      unit: true,
      location: true,
      deliveryItems:{
        include:{
          delivery:true,
        }
      },
      
    },
    orderBy: {
      createdAt: 'desc',
    },
  })
}


async generateIncomingPdf(goodsId: string) {
  const goods = await this.prisma.goods.findUnique({
    where: { id: goodsId },
    include: {
      photos: true,
      unit: true,
      location: true,
      incomingForm: {
        include: {
          items: true
        }
      },
    },
  });

  if (!goods) {
    throw new NotFoundException('Goods not found');
  }

  const incomingPhotos = goods.photos.filter((p) => p.process === 'INCOMING');

  const doc = new PDFDocument({ 
    size: 'A4', 
    margin: 50,
    bufferPages: true 
  });
  
  const stream = new PassThrough();
  const buffers: any[] = [];

  doc.pipe(stream);
  stream.on('data', buffers.push.bind(buffers));

  // ================= 1. HEADER & BRANDING =================
  const logoPath = path.join(process.cwd(), 'public/logo.png');
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 50, 45, { width: 80 });
  }

  doc
    .fontSize(16)
    .font('Helvetica-Bold')
    .text('INCOMING INSPECTION REPORT', { align: 'right' });
  
  doc
    .fontSize(9)
    .font('Helvetica')
    .fillColor('#666666')
    .text(`Report ID: IN-${goods.unit?.engineNumber}-${new Date().getTime()}`, { align: 'right' });
  
  doc.moveDown(2);
  doc.strokeColor('#eeeeee').lineWidth(1).moveTo(50, 100).lineTo(545, 100).stroke();

  // ================= 2. SUMMARY BOX =================
  doc.moveDown(2);
  const summaryTop = doc.y;
  
  // Background Box
  doc.rect(50, summaryTop, 495, 85).fill('#f8fafc').stroke('#e2e8f0');
  doc.fillColor('#000000');

  // Unit Data
  doc.fontSize(10).font('Helvetica-Bold').text('UNIT INFORMATION', 65, summaryTop + 15);
  
  doc.font('Helvetica').fontSize(9);
  const col1 = 65;
  const col2 = 250;

  doc.text(`Brand / Type  : ${goods.unit?.brand || '-'}`, col1, summaryTop + 35);
  doc.text(`Engine No     : ${goods.unit?.engineNumber}`, col1, summaryTop + 50);
  doc.text(`Chassis No    : ${goods.unit?.chassisNumber}`, col1, summaryTop + 65);

  doc.text(`Location Zone : ${goods.location?.zone || '-'}`, col2, summaryTop + 35);
  doc.text(`Row / Lane    : ${goods.location?.row || '-'} / ${goods.location?.lane || '-'}`, col2, summaryTop + 50);
  doc.text(`Insp. Date    : ${new Date().toLocaleDateString('id-ID')}`, col2, summaryTop + 65);

  doc.moveDown(5);

  // ================= 3. INSPECTION TABLE =================
  doc.fontSize(11).font('Helvetica-Bold').text('INSPECTION CHECKLIST', 50);
  doc.moveDown(0.5);

  const tableTop = doc.y;
  const colCategory = 50;
  const colItem = 150;
  const colStatus = 320;
  const colNote = 390;

  // Header Table
  doc.rect(50, tableTop, 495, 20).fill('#1e293b');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
  doc.text('CATEGORY', colCategory + 5, tableTop + 6);
  doc.text('ITEM NAME', colItem, tableTop + 6);
  doc.text('STATUS', colStatus, tableTop + 6);
  doc.text('REMARKS / NOTES', colNote, tableTop + 6);

  let currentY = tableTop + 20;
  doc.fillColor('#000000').font('Helvetica').fontSize(8);

  goods.incomingForm?.items.forEach((item, index) => {
    // Zebra Striping
    if (index % 2 !== 0) {
      doc.rect(50, currentY, 495, 20).fill('#f1f5f9').fillColor('#000000');
    } else {
      doc.fillColor('#000000');
    }

    // Wrap text for notes to avoid overflow
    const noteText = item.note || '-';
    
    doc.text(item.category.toUpperCase(), colCategory + 5, currentY + 6, { width: 90 });
    doc.text(item.itemName, colItem, currentY + 6, { width: 160 });
    
    // Status Color Coding
    if (item.status === 'OK' || item.status === 'GOOD') {
      doc.fillColor('#059669').font('Helvetica-Bold');
    } else {
      doc.fillColor('#dc2626').font('Helvetica-Bold');
    }
    doc.text(item.status, colStatus, currentY + 6);
    
    doc.fillColor('#475569').font('Helvetica');
    doc.text(noteText, colNote, currentY + 6, { width: 150 });

    currentY += 20;

    // Page Break Handling
    if (currentY > 750) {
      doc.addPage();
      currentY = 50;
    }
  });

  // ================= 4. PHOTO EVIDENCE (GRID 2x2) =================
  if (incomingPhotos.length > 0) {
    doc.addPage();
    doc.fillColor('#000000').fontSize(12).font('Helvetica-Bold').text('PHOTO EVIDENCE', 50, 50);
    doc.moveDown();

    const photoWidth = 235;
    const photoHeight = 170;
    const gap = 15;
    let photoX = 50;
    let photoY = doc.y + 10;

    for (let i = 0; i < incomingPhotos.length; i++) {
      const photo = incomingPhotos[i];
      const filename = photo.url.split('/').pop();
      const imagePath = path.join(process.cwd(), 'uploads', 'incoming', filename || '');

      if (fs.existsSync(imagePath)) {
        // Draw Frame
        doc.rect(photoX, photoY, photoWidth, photoHeight).stroke('#e2e8f0');
        
        try {
          doc.image(imagePath, photoX + 5, photoY + 5, {
            fit: [photoWidth - 10, photoHeight - 10],
            align: 'center',
            valign: 'center'
          });
        } catch (e) {
          doc.fontSize(8).text('Error loading image', photoX + 10, photoY + 10);
        }

        // Label Foto
        doc.fontSize(7).fillColor('#94a3b8').text(`Evidence Image ${i + 1}`, photoX, photoY + photoHeight + 5);

        // Update X & Y for Grid
        if ((i + 1) % 2 === 0) {
          photoX = 50;
          photoY += photoHeight + 40;
        } else {
          photoX += photoWidth + gap;
        }

        // Page break if photos exceed page
        if (photoY > 700) {
          doc.addPage();
          photoY = 50;
          photoX = 50;
        }
      }
    }
  }

  // Footer
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor('#94a3b8').text(
      `Page ${i + 1} of ${pages.count} | Printed: ${new Date().toLocaleString()}`,
      50,
      780,
      { align: 'center' }
    );
  }

  doc.end();

  return await new Promise<Buffer>((resolve) => {
    stream.on('end', () => {
      resolve(Buffer.concat(buffers));
    });
  });
}

// async generatePDIPDF(goodsId: string, res: Response) {

//   const goods = await this.prisma.goods.findUnique({
//     where: { id: goodsId },
//     include: {
//       unit: true,
//       pdiRecords: {
//         orderBy: { createdAt: 'asc' },
//       },
//       photos: {
//         where: { process: 'PDI' },
//       },
//     },
//   })

//   if (!goods) {
//     throw new BadRequestException('Goods not found')
//   }

//   const doc = new PDFDocument({ size: 'A4', margin: 50 })

//   res.setHeader('Content-Type', 'application/pdf')
//   res.setHeader(
//     'Content-Disposition',
//     `inline; filename=PDI-${goods.unit.engineNumber}.pdf`,
//   )

//   doc.pipe(res)

//   // ===============================
//   // HEADER GLOBAL
//   // ===============================
//   doc
//     .fontSize(18)
//     .font('Helvetica-Bold')
//     .text('PDI REPORT', { align: 'center' })

//   doc.moveDown(1)

//   doc.fontSize(11).font('Helvetica')
//   doc.text(`Engine Number : ${goods.unit.engineNumber}`)
//   doc.text(`Chassis Number: ${goods.unit.chassisNumber}`)
//   doc.text(`Total PDI     : ${goods.pdiRecords.length}`)

//   doc.moveDown(2)

//   // ===============================
//   // LOOP SEMUA PDI RECORD
//   // ===============================
//   goods.pdiRecords.forEach((pdi, index) => {

//     if (index !== 0) doc.addPage()

//     doc
//       .fontSize(14)
//       .font('Helvetica-Bold')
//       .text(`DOKUMEN PDI #${index + 1}`)

//     doc.moveDown(1)

//     doc.font('Helvetica').fontSize(11)

//     doc.text(`Tanggal PDI : ${new Date(pdi.createdAt).toLocaleDateString()}`)
//     doc.text(`Result      : ${pdi.result || '-'}`)
//     doc.text(`StickerDate : ${pdi.stickerDate ? new Date(pdi.stickerDate).toLocaleDateString() : '-'}`)

//     doc.moveDown(1)

//     const form = pdi.formData as any

//     const printSection = (title: string, items: any[]) => {
//       if (!items) return

//       doc.font('Helvetica-Bold').text(title)
//       doc.moveDown(0.5)
//       doc.font('Helvetica')

//       items.forEach(item => {
//         doc.text(`${item.label} .......... ${item.ok ? 'OK' : 'NG'}`)
//         if (item.note) {
//           doc.text(`  Ket: ${item.note}`)
//         }
//         doc.moveDown(0.5)
//       })

//       doc.moveDown(1)
//     }

//     printSection('Body / Exterior', form.bodyExterior)
//     printSection('Ruang Mesin', form.engineRoom)
//     printSection('Minyak / Oli', form.fluids)
//     printSection('Lampu-Lampu', form.lights)
//     printSection('Fungsi Interior', form.interior)
//   })

//   // ===============================
//   // FOTO GLOBAL PDI
//   // ===============================
//   if (goods.photos.length > 0) {

//     doc.addPage()

//     doc
//       .fontSize(16)
//       .font('Helvetica-Bold')
//       .text('FOTO PDI (BY GOODS)', { align: 'center' })

//     doc.moveDown(2)

//     goods.photos.forEach(photo => {

//       const imagePath = path.join(process.cwd(), photo.path)

//       if (fs.existsSync(imagePath)) {
//         doc.image(imagePath, {
//           fit: [250, 180],
//           align: 'center',
//         })
//         doc.moveDown(1)
//       }
//     })
//   }

//   doc.end()
// }




// async generatePDIPDF(goodsId: string): Promise<Buffer> {

//   const goods = await this.prisma.goods.findUnique({
//     where: { id: goodsId },
//     include: {
//       unit: true,
//       pdiRecords: {
//         orderBy: { createdAt: 'asc' },
//         include: { items: true }
//       },
//       photos: {
//         where: { process: 'PDI' }
//       }
//     }
//   })

//   if (!goods) throw new Error('Goods not found')

//   const PDFDocument = require('pdfkit')
//   const doc = new PDFDocument({ size: 'A4', margin: 40 })

//   const buffers: Buffer[] = []

//   doc.on('data', buffers.push.bind(buffers))

//   const done = new Promise<Buffer>((resolve, reject) => {
//     doc.on('end', () => {
//       resolve(Buffer.concat(buffers))
//     })
//     doc.on('error', reject)
//   })

//   // =============================
//   // CONTENT
//   // =============================

//   goods.pdiRecords.forEach((pdi, index) => {

//     if (index !== 0) doc.addPage()

//     doc.fontSize(16)
//       .font('Helvetica-Bold')
//       .text('PDI CHECK LIST', { align: 'center' })

//     doc.moveDown(2)

//     doc.fontSize(10).font('Helvetica')

//     doc.text(`No Rangka : ${goods.unit?.chassisNumber || '-'}`)
//     doc.text(`No Mesin  : ${goods.unit?.engineNumber || '-'}`)
//     doc.text(`Status    : ${goods.currentStatus}`)

//     doc.moveDown(2)

//     doc.font('Helvetica-Bold')
//       .text(`DOKUMEN PDI ${index + 1}`)

//     doc.moveDown(1)

//     doc.font('Helvetica')
//     doc.text(`Tanggal PDI : ${new Date(pdi.createdAt).toLocaleDateString()}`)
//     doc.text(`Technician  : ${pdi.technicianName}`)
//     doc.text(`Supervisor  : ${pdi.supervisorName}`)

//     doc.moveDown(2)

//     pdi.items.forEach(item => {
//       doc.text(`${item.category} - ${item.itemName}`)
//       doc.text(`Status : ${item.status}`)
//       if (item.note) doc.text(`Note   : ${item.note}`)
//       doc.moveDown(1)
//     })
//   })

//   // =============================
//   // FOTO
//   // =============================

//   if (goods.photos.length > 0) {

//     doc.addPage()
//     doc.fontSize(14).font('Helvetica-Bold')
//       .text('FOTO PDI', { align: 'center' })

//     doc.moveDown(2)

//     const fs = require('fs')
//     const path = require('path')

//     let x = 50
//     let y = doc.y

//     goods.photos.forEach(photo => {

//       const imagePath = path.join(
//         process.cwd(),
//         photo.url.replace(/^\//, ''),
//       )

//       if (fs.existsSync(imagePath)) {
//         doc.image(imagePath, x, y, { fit: [200, 150] })

//         x += 220

//         if (x > 400) {
//           x = 50
//           y += 170
//         }
//       }
//     })
//   }

//   doc.end()

//   return done
// }


async generatePDIPDF(goodsId: string): Promise<Buffer> {
  const goods = await this.prisma.goods.findUnique({
    where: { id: goodsId },
    include: {
      unit: true,
      pdiRecords: {
        orderBy: { createdAt: 'asc' },
        include: { items: true }
      },
      photos: {
        where: {
          process: { in: ['PDI', 'PDI_STICKER'] }
        }
      }
    }
  });

  if (!goods) throw new Error('Goods not found');

  const PDFDocument = require('pdfkit');

  // Balikin bufferPages: true untuk hitung total halaman di akhir tanpa nambah halaman baru
  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    autoFirstPage: false,
    bufferPages: true 
  });

  const buffers: Buffer[] = [];
  doc.on('data', buffers.push.bind(buffers));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
  });

  const bottomLimit = 740;

  // ======================================================
  // RENDER PDI RECORDS
  // ======================================================
  for (let r = 0; r < goods.pdiRecords.length; r++) {
    const pdi = goods.pdiRecords[r];
    doc.addPage(); 

    // Header
    const logoPath = path.join(process.cwd(), 'public/logo.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 45, { width: 80 });
    }

    doc.fontSize(16).font('Helvetica-Bold')
      .text('PRE-DELIVERY INSPECTION (PDI)', 0, 50, { align: 'right' });

    doc.fontSize(9).font('Helvetica').fillColor('#666')
      .text(`Unit Status: ${goods.currentStatus}`, { align: 'right' })
      .text(`Doc Ref: PDI-${goods.unit?.engineNumber}-${r + 1}`, { align: 'right' });

    doc.strokeColor('#eee').moveTo(50, 105).lineTo(545, 105).stroke();

    // Unit Info
    doc.moveDown(2);
    const boxTop = doc.y;
    doc.rect(50, boxTop, 495, 90).fill('#f8fafc').stroke('#e2e8f0');
    doc.fillColor('#000').fontSize(10).font('Helvetica-Bold').text('UNIT & INSPECTION DETAILS', 65, boxTop + 15);
    doc.font('Helvetica').fontSize(9);
    doc.text(`Engine No    : ${goods.unit?.engineNumber || '-'}`, 65, boxTop + 35);
    doc.text(`Chassis No   : ${goods.unit?.chassisNumber || '-'}`, 65, boxTop + 50);
    doc.text(`Vehicle      : ${goods.unit?.brand || '-'}`, 65, boxTop + 65);

    const colRight = 300;
    doc.text(`Technician   : ${pdi.technicianName}`, colRight, boxTop + 35);
    doc.text(`Supervisor   : ${pdi.supervisorName}`, colRight, boxTop + 50);
    doc.text(`PDI Date     : ${new Date(pdi.createdAt).toLocaleDateString('id-ID')}`, colRight, boxTop + 65);

    doc.moveDown(5);
    doc.fontSize(11).font('Helvetica-Bold').text(`CHECKLIST ITEMS - REPORT #${r + 1}`, 50);
    doc.moveDown(0.5);

    let currentY = doc.y;
    const colCat = 50, colItem = 160, colStatus = 340, colNote = 410;

    const renderTableHeader = (y: number) => {
      doc.rect(50, y, 495, 20).fill('#0f172a');
      doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
      doc.text('CATEGORY', colCat + 8, y + 6);
      doc.text('INSPECTION ITEM', colItem, y + 6);
      doc.text('STATUS', colStatus, y + 6);
      doc.text('REMARKS', colNote, y + 6);
      doc.fillColor('#000').font('Helvetica').fontSize(8.5);
      return y + 20;
    };

    currentY = renderTableHeader(currentY);

    for (let i = 0; i < pdi.items.length; i++) {
      const item = pdi.items[i];
      if (currentY + 25 > bottomLimit) {
        doc.addPage();
        currentY = 60;
        currentY = renderTableHeader(currentY);
      }

      if (i % 2 !== 0) doc.rect(50, currentY, 495, 22).fill('#f1f5f9');

      doc.fillColor('#000');
      doc.text(item.category.toUpperCase(), colCat + 8, currentY + 7, { width: 100 });
      doc.text(item.itemName, colItem, currentY + 7, { width: 170 });

      const isOk = item.status.toLowerCase() === 'ok' || item.status.toLowerCase() === 'good';
      doc.font('Helvetica-Bold').fillColor(isOk ? '#16a34a' : '#dc2626').text(item.status.toUpperCase(), colStatus, currentY + 7);
      doc.font('Helvetica').fillColor('#475569').text(item.note || '-', colNote, currentY + 7, { width: 130 });
      currentY += 22;
    }
  }

  // ======================================================
  // PHOTO SECTION
  // ======================================================
  if (goods.photos.length > 0) {
    doc.addPage(); // Paksa halaman baru buat foto

    doc.fillColor('#000').fontSize(14).font('Helvetica-Bold')
       .text('PDI VISUAL DOCUMENTATION', 50, 60, { align: 'center' });

    let x = 50, y = 110;
    const photoWidth = 230, photoHeight = 160, gap = 20;

    for (let i = 0; i < goods.photos.length; i++) {
      const photo = goods.photos[i];
      const imagePath = path.join(process.cwd(), photo.url.replace(/^\//, ''));
      if (!fs.existsSync(imagePath)) continue;

      if (y + photoHeight > bottomLimit) {
        doc.addPage();
        y = 70; x = 50;
      }

      doc.rect(x, y, photoWidth, photoHeight).stroke('#e2e8f0');
      try {
        doc.image(imagePath, x + 5, y + 5, {
          fit: [photoWidth - 10, photoHeight - 10],
          align: 'center', valign: 'center'
        });
      } catch (err) {}

      doc.fontSize(7).fillColor('#64748b').text(`${photo.process} - #${i + 1}`, x, y + photoHeight + 5);

      x += photoWidth + gap;
      if (x > 450) { x = 50; y += photoHeight + 40; }
    }
  }

  // ======================================================
  // FINAL FOOTER (RENDER AMAN)
  // ======================================================
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Kita gambar manual di koordinat absolut supaya gak trigger addPage baru
    doc.save();
    doc.fontSize(8).fillColor('#94a3b8').text(
      `PDI Report - Page ${i + 1} of ${range.count} | ${goods.unit?.engineNumber || '-'}`,
      50,
      810, // Koordinat di luar area margin bawah (A4 height is 842)
      { align: 'center', lineBreak: false }
    );
    doc.restore();
  }

  doc.end();
  return done;
}


// async exportFullBackup(): Promise<Buffer> {

//   const ExcelJS = require('exceljs')
//   const archiver = require('archiver')
//   const fs = require('fs')
//   const path = require('path')
//   const { PassThrough } = require('stream')

//   // ===============================
//   // FETCH ALL DATA
//   // ===============================

//   const goods = await this.prisma.goods.findMany({
//     include: {
//       unit: true,
//       pdiRecords: {
//         include: {
//           items: true
//         }
//       },
//       repairs: true,
//       logs: true,
//       photos: true
//     }
//   })

//   // ===============================
//   // BUILD EXCEL
//   // ===============================

//   const workbook = new ExcelJS.Workbook()

//   const goodsSheet = workbook.addWorksheet('GOODS')
//   goodsSheet.columns = [
//     { header: 'Goods ID', key: 'id', width: 36 },
//     { header: 'Status', key: 'status', width: 20 },
//     { header: 'Engine', key: 'engine', width: 20 },
//     { header: 'Chassis', key: 'chassis', width: 20 },
//     { header: 'Created At', key: 'createdAt', width: 25 },
//   ]

//   goods.forEach(g => {
//     goodsSheet.addRow({
//       id: g.id,
//       status: g.currentStatus,
//       engine: g.unit?.engineNumber,
//       chassis: g.unit?.chassisNumber,
//       createdAt: g.createdAt,
//     })
//   })

//   const pdiSheet = workbook.addWorksheet('PDI_RECORD')
//   pdiSheet.columns = [
//     { header: 'PDI ID', key: 'id', width: 36 },
//     { header: 'Goods ID', key: 'goodsId', width: 36 },
//     { header: 'Technician', key: 'tech', width: 20 },
//     { header: 'Supervisor', key: 'sup', width: 20 },
//     { header: 'Sticker Date', key: 'sticker', width: 25 },
//     { header: 'Created At', key: 'createdAt', width: 25 },
//   ]

//   goods.forEach(g => {
//     g.pdiRecords.forEach(pdi => {
//       pdiSheet.addRow({
//         id: pdi.id,
//         goodsId: g.id,
//         tech: pdi.technicianName,
//         sup: pdi.supervisorName,
//         sticker: pdi.stickerDate,
//         createdAt: pdi.createdAt,
//       })
//     })
//   })

//   const itemSheet = workbook.addWorksheet('PDI_ITEMS')
//   itemSheet.columns = [
//     { header: 'Item ID', key: 'id', width: 36 },
//     { header: 'PDI ID', key: 'pdiId', width: 36 },
//     { header: 'Category', key: 'category', width: 25 },
//     { header: 'Item Name', key: 'itemName', width: 25 },
//     { header: 'Status', key: 'status', width: 15 },
//     { header: 'Note', key: 'note', width: 30 },
//   ]

//   goods.forEach(g => {
//     g.pdiRecords.forEach(pdi => {
//       pdi.items.forEach(item => {
//         itemSheet.addRow({
//           id: item.id,
//           pdiId: pdi.id,
//           category: item.category,
//           itemName: item.itemName,
//           status: item.status,
//           note: item.note,
//         })
//       })
//     })
//   })

//   const activitySheet = workbook.addWorksheet('ACTIVITY_LOG')
//   activitySheet.columns = [
//     { header: 'Log ID', key: 'id', width: 36 },
//     { header: 'Goods ID', key: 'goodsId', width: 36 },
//     { header: 'Action', key: 'action', width: 25 },
//     { header: 'From', key: 'from', width: 20 },
//     { header: 'To', key: 'to', width: 20 },
//     { header: 'Created At', key: 'createdAt', width: 25 },
//   ]

//   goods.forEach(g => {
//     g.logs.forEach(log => {
//       activitySheet.addRow({
//         id: log.id,
//         goodsId: g.id,
//         action: log.action,
//         from: log.fromStatus,
//         to: log.toStatus,
//         createdAt: log.createdAt,
//       })
//     })
//   })

//   const excelBuffer = await workbook.xlsx.writeBuffer()

//   // ===============================
//   // CREATE ZIP
//   // ===============================

//   const archive = archiver('zip', { zlib: { level: 9 } })
//   const stream = new PassThrough()
//   const buffers: Buffer[] = []

//   archive.pipe(stream)

//   stream.on('data', (data) => buffers.push(data))

//   // Add Excel
//   archive.append(excelBuffer, { name: 'YARD-DATA.xlsx' })

//   // Add Photos Folder
//   const uploadPath = path.join(process.cwd(), 'uploads')

//   if (fs.existsSync(uploadPath)) {
//     archive.directory(uploadPath, 'photos')
//   }

//   await archive.finalize()

//   return new Promise((resolve, reject) => {
//     stream.on('end', () => {
//       resolve(Buffer.concat(buffers))
//     })
//     stream.on('error', reject)
//   })
// }

// async exportFullBackup(res: any) {

//   const ExcelJS = require('exceljs')
//   const archiver = require('archiver')
//   const path = require('path')
//   const fs = require('fs')

//   // Fetch minimal fields (lebih ringan)
//   const goods = await this.prisma.goods.findMany({
//     include: {
//       unit: true,
//       pdiRecords: {
//         include: { items: true }
//       },
//       logs: true,
//     }
//   })

//   // Create workbook
//   const workbook = new ExcelJS.Workbook()
//   const sheet = workbook.addWorksheet('GOODS')

//   sheet.columns = [
//     { header: 'Goods ID', key: 'id', width: 36 },
//     { header: 'Engine', key: 'engine', width: 20 },
//     { header: 'Chassis', key: 'chassis', width: 20 },
//     { header: 'Status', key: 'status', width: 20 },
//   ]

//   goods.forEach(g => {
//     sheet.addRow({
//       id: g.id,
//       engine: g.unit?.engineNumber,
//       chassis: g.unit?.chassisNumber,
//       status: g.currentStatus,
//     })
//   })

//   const archive = archiver('zip', {
//     zlib: { level: 3 } // 🔥 jangan 9, bikin lama
//   })

//   res.setHeader('Content-Type', 'application/zip')
//   res.setHeader(
//     'Content-Disposition',
//     'attachment; filename=YARD-FULL-BACKUP.zip'
//   )

//   archive.pipe(res)

//   // Excel stream
//   const excelBuffer = await workbook.xlsx.writeBuffer()
//   archive.append(excelBuffer, { name: 'YARD-DATA.xlsx' })

//   // Photos folder
//   const uploadPath = path.join(process.cwd(), 'uploads')

//   if (fs.existsSync(uploadPath)) {
//     archive.directory(uploadPath, 'photos')
//   }

//   await archive.finalize()
// }

async exportFullBackup(res: any) {
  const ExcelJS = require('exceljs')
  const archiver = require('archiver')
  const path = require('path')
  const fs = require('fs')

  // =========================
  // FETCH DATA
  // =========================
  const goods = await this.prisma.goods.findMany({
    include: {
      unit: true,
      location: true,
      pdiRecords: true,
      repairs: true,
      deliveryItems: {
        include: {
          delivery: true,
        },
      },
      bast: true,
    },
  })

  // =========================
  // CREATE EXCEL
  // =========================
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('YARD DATA')

  sheet.columns = [
    { header: 'Engine Number', key: 'engine', width: 20 },
    { header: 'Chassis Number', key: 'chassis', width: 22 },
    { header: 'BL Number', key: 'bl', width: 18 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Location', key: 'location', width: 12 },
    { header: 'Incoming Date', key: 'incomingDate', width: 18 },
    { header: 'PDI Date', key: 'pdiDate', width: 25 },
    { header: 'Sticker Date', key: 'stickerDate', width: 25 },
    { header: 'Repair Period', key: 'repair', width: 30 },
    { header: 'Surat Jalan Number', key: 'sj', width: 20 },
    { header: 'Tujuan Pengiriman', key: 'tujuan', width: 22 },
    { header: 'Delivered At', key: 'deliveredAt', width: 18 },
    { header: 'Received At (BAST)', key: 'receivedAt', width: 20 },
    { header: 'Completed At', key: 'completedAt', width: 20 },
  ]

  // =========================
  // HELPERS
  // =========================
  const formatDate = (d?: Date | null) => {
    if (!d) return ''
    const date = new Date(d)
    if (isNaN(date.getTime())) return ''
    return date.toISOString().slice(0, 10)
  }

  const multiLine = (arr: string[]) => {
    return arr.length ? arr.join('\n') : ''
  }

  // =========================
  // BUILD ROWS
  // =========================
  goods.forEach((g) => {
    const location = g.location
      ? `${g.location.zone}-${g.location.row}-${g.location.lane}`
      : ''

    const pdiDates = multiLine(
      g.pdiRecords.map((r) => formatDate(r.pdiDate))
    )

    const stickerDates = multiLine(
      g.pdiRecords
        .filter((r) => r.stickerDate)
        .map((r) => formatDate(r.stickerDate))
    )

    const repairPeriods = multiLine(
      g.repairs.map(
        (r) =>
          `${formatDate(r.startDate)} - ${formatDate(r.endDate)}`
      )
    )

    const deliveryItem = g.deliveryItems?.[0]
    const delivery = deliveryItem?.delivery

    sheet.addRow({
      engine: g.unit?.engineNumber || '',
      chassis: g.unit?.chassisNumber || '',
      bl: g.unit?.blNumber || '',
      status: g.currentStatus,
      location,
      incomingDate: formatDate(g.incomingDate),
      pdiDate: pdiDates,
      stickerDate: stickerDates,
      repair: repairPeriods,
      sj: delivery?.suratJalanNumber || '',
      tujuan: deliveryItem?.tujuanPengiriman || '',
      deliveredAt: formatDate(delivery?.deliveredAt),
      receivedAt: formatDate(g.bast?.completedAt),
      completedAt: formatDate(delivery?.completedAt),
    })
  })

  // =========================
  // ENABLE WRAP TEXT
  // =========================
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.alignment = { wrapText: true, vertical: 'top' }
    })
  })

  // Freeze header
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  // =========================
  // CREATE ZIP
  // =========================
  const archive = archiver('zip', {
    zlib: { level: 3 }, // jangan 9 (lambat)
  })

  res.setHeader('Content-Type', 'application/zip')
  res.setHeader(
    'Content-Disposition',
    'attachment; filename=YARD-FULL-BACKUP.zip'
  )

  archive.pipe(res)

  // Excel buffer
  const excelBuffer = await workbook.xlsx.writeBuffer()
  archive.append(excelBuffer, { name: 'YARD-DATA.xlsx' })

  // =========================
  // ADD PHOTOS FOLDER
  // =========================
  const uploadPath = path.join(process.cwd(), 'uploads')

  if (fs.existsSync(uploadPath)) {
    archive.directory(uploadPath, 'photos')
  }

  await archive.finalize()
}



async generateRepairPDF(goodsId: string): Promise<Buffer> {
  const PDFDocument = require('pdfkit');
  const fs = require('fs');
  const path = require('path');

  const goods = await this.prisma.goods.findUnique({
    where: { id: goodsId },
    include: {
      unit: true,
      repairs: { orderBy: { createdAt: 'asc' } },
      photos: { where: { process: 'REPAIR' } }
    }
  });

  if (!goods) throw new Error('Goods not found');

  // Pakai bufferPages: true lagi biar bisa dapet total halaman buat footer
  const doc = new PDFDocument({ 
    size: 'A4', 
    margin: 50,
    autoFirstPage: false,
    bufferPages: true 
  });
  
  const buffers: Buffer[] = [];
  doc.on('data', buffers.push.bind(buffers));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
  });

  const bottomLimit = 750;

  // ==========================================
  // LOOP REPAIR RECORDS
  // ==========================================
  for (let index = 0; index < goods.repairs.length; index++) {
    const repair = goods.repairs[index];
    doc.addPage();
    let currentY = 50; // Mulai koordinat Y dari paling atas

    const form = repair.formData as any;

    // --- HEADER ---
    const logoPath = path.join(process.cwd(), 'public/logo.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 45, { width: 80 });
    }

    doc.fontSize(16).font('Helvetica-Bold').text('VEHICLE REPAIR REPORT', 200, 50, { align: 'right' });
    doc.fontSize(9).font('Helvetica').fillColor('#666666')
      .text(`Job Order: REP-${goods.unit?.engineNumber}-${index + 1}`, 200, 70, { align: 'right' })
      .text(`Status: ${repair.result || 'COMPLETED'}`, 200, 82, { align: 'right' });

    currentY = 115;
    doc.strokeColor('#eeeeee').lineWidth(1).moveTo(50, 105).lineTo(545, 105).stroke();

    // --- SERVICE SUMMARY BOX ---
    doc.rect(50, currentY, 495, 85).fill('#fcfcfc').stroke('#e2e8f0');
    doc.fillColor('#000000');
    doc.fontSize(10).font('Helvetica-Bold').text('SERVICE SUMMARY', 65, currentY + 12);
    
    doc.font('Helvetica').fontSize(9);
    doc.text(`Engine No    : ${goods.unit?.engineNumber || '-'}`, 65, currentY + 30);
    doc.text(`Chassis No   : ${goods.unit?.chassisNumber || '-'}`, 65, currentY + 45);
    doc.text(`Vehicle      : ${goods.unit?.brand || '-'}`, 65, currentY + 60);

    const colRight = 300;
    doc.text(`Technician   : ${form?.technicianName || '-'}`, colRight, currentY + 30);
    doc.text(`Start Date   : ${new Date(repair.startDate).toLocaleDateString('id-ID', { dateStyle: 'long' })}`, colRight, currentY + 45);
    doc.text(`Repair Result: ${repair.result || 'DONE'}`, colRight, currentY + 60);

    currentY += 110;

    // --- REPAIR ITEMS TABLE ---
    doc.fontSize(11).font('Helvetica-Bold').text('REPAIR DETAILS & ACTIONS', 50, currentY);
    currentY += 20;

    const colNo = 50, colCat = 80, colType = 180, colDetail = 280, colAction = 410;

    const renderHeader = (yPos: number) => {
      doc.rect(50, yPos, 495, 20).fill('#334155');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
      doc.text('NO', colNo + 5, yPos + 6);
      doc.text('CATEGORY', colCat, yPos + 6);
      doc.text('REPAIR TYPE', colType, yPos + 6);
      doc.text('PROBLEM DETAIL', colDetail, yPos + 6);
      doc.text('ACTION TAKEN', colAction, yPos + 6);
      return yPos + 20;
    };

    currentY = renderHeader(currentY);
    doc.fillColor('#000000').font('Helvetica').fontSize(8);

    if (form?.items?.length) {
      for (let i = 0; i < form.items.length; i++) {
        const item = form.items[i];
        
        // Proteksi Overflow: Ganti halaman kalau sisa baris gak muat
        if (currentY + 40 > bottomLimit) {
          doc.addPage();
          currentY = renderHeader(50);
        }

        if (i % 2 !== 0) doc.rect(50, currentY, 495, 35).fill('#f8fafc');
        
        doc.fillColor('#000000');
        doc.text(String(i + 1), colNo + 5, currentY + 12);
        doc.font('Helvetica-Bold').text(item.category?.toUpperCase() || '-', colCat, currentY + 12);
        doc.font('Helvetica').text(item.repairType || '-', colType, currentY + 12);
        doc.text(item.detail || '-', colDetail, currentY + 8, { width: 120 });
        
        doc.font('Helvetica-Bold').fillColor('#0369a1');
        doc.text(item.action || '-', colAction, currentY + 8, { width: 130 });
        doc.fillColor('#000000').font('Helvetica');

        currentY += 35;
      }
    }

    // Tanda Tangan (di bawah tabel)
    if (currentY + 80 < bottomLimit) {
       doc.fontSize(9).font('Helvetica-Bold').text('Technician Signature,', 400, currentY + 20);
       doc.text(`( ${form?.technicianName || '            '} )`, 400, currentY + 70);
    }
  }

  // ==========================================
  // FOTO SECTION (Halaman Baru)
  // ==========================================
  if (goods.photos.length > 0) {
    doc.addPage();
    doc.fillColor('#000000').fontSize(14).font('Helvetica-Bold').text('REPAIR VISUAL DOCUMENTATION', 50, 50, { align: 'center' });

    let x = 50, y = 90;
    const photoWidth = 230, photoHeight = 160, gap = 20;

    for (let i = 0; i < goods.photos.length; i++) {
      const photo = goods.photos[i];
      const imagePath = path.join(process.cwd(), photo.url.replace(/^\//, ''));

      if (fs.existsSync(imagePath)) {
        if (y + photoHeight > bottomLimit) {
          doc.addPage();
          y = 50; x = 50;
        }

        doc.rect(x, y, photoWidth, photoHeight).stroke('#cbd5e1');
        try {
          doc.image(imagePath, x + 5, y + 5, {
            fit: [photoWidth - 10, photoHeight - 10],
            align: 'center', valign: 'center'
          });
        } catch (e) {}

        doc.fontSize(7).fillColor('#64748b').text(`REPAIR EVIDENCE #${i + 1}`, x, y + photoHeight + 5);

        x += photoWidth + gap;
        if (x > 450) { x = 50; y += photoHeight + 40; }
      }
    }
  }

  // ==========================================
  // FINAL FOOTER RENDERING (Anti-Ghosting)
  // ==========================================
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.save();
    doc.fontSize(8).fillColor('#94a3b8').text(
      `Repair Report | Page ${i + 1} of ${range.count} | Unit: ${goods.unit?.engineNumber || '-'}`,
      50, 815, { align: 'center', lineBreak: false }
    );
    doc.restore();
  }

  doc.end();
  return done;
}


async hardDeleteGoods(goodsId: string, userId: string) {

  return this.prisma.$transaction(async (tx) => {

    const goods = await tx.goods.findUnique({
      where: { id: goodsId },
      include:{
        photos:true
      }
    });

    if (!goods)
      throw new NotFoundException('Goods not found');

    if (!['INCOMING', 'PDI', 'REPAIR', 'READY'].includes(goods.currentStatus)) {
      throw new BadRequestException(
        'Hard delete only allowed before delivery'
      );
    }

    //DELETE ONLY IF USE CLOUDINARY IMAGES
    for (const photo of goods.photos){
      if (photo.publicId){
        try{
          await cloudinary.uploader.destroy(photo.publicId)
        
        } catch (err){
          console.error("Cloudinary Delete Failed:",photo.publicId)
        }
      }
    }

    // delete delivery items (jaga2 kalau ada)
    await tx.deliveryItem.deleteMany({
      where: { goodsId }
    });

    // delete photos
    await tx.photo.deleteMany({
      where: { goodsId }
    });

    
    // delete PDIItem
    await tx.pDIItem.deleteMany({
      where: { 
        record: {
          goodsId
        }
       }
    });

    await tx.incomingInspectionItem.deleteMany({
      where: {
        form: {
          goodsId
        }
      }
    })

    await tx.incomingForm.deleteMany({
      where: {goodsId}
    })


    // delete PDI
    await tx.pDIRecord.deleteMany({
      where: { goodsId }
    });

    // delete repair
    await tx.repairRecord.deleteMany({
      where: { goodsId }
    });

    // delete activity logs
    await tx.activityLog.deleteMany({
      where: { goodsId }
    });

    // delete goods
    await tx.goods.delete({
      where: { id: goodsId }
    });

    return { message: 'Goods fully deleted' };
  });
}

async rollbackDelivery(goodsId: string, userId: string) {

  return this.prisma.$transaction(async (tx) => {

    const goods = await tx.goods.findUnique({
      where: { id: goodsId }
    });

    if (!goods)
      throw new NotFoundException('Goods not found');

    if (goods.currentStatus !== 'DELIVERED')
      throw new BadRequestException(
        'Only DELIVERED goods can rollback'
      );

    const deliveryItem = await tx.deliveryItem.findFirst({
      where: { goodsId }
    });

    if (!deliveryItem)
      throw new BadRequestException('Delivery item not found');

    const deliveryId = deliveryItem.deliveryId;

    // delete delivery item
    await tx.deliveryItem.delete({
      where: { id: deliveryItem.id }
    });

    // cek masih ada item lain?
    const remaining = await tx.deliveryItem.count({
      where: { deliveryId }
    });

    if (remaining === 0) {
      await tx.delivery.delete({
        where: { id: deliveryId }
      });
    }

    // reset goods
    await tx.goods.update({
      where: { id: goodsId },
      data: {
        currentStatus: 'READY',
        deliveryToken: null,
        verificationCode: null,
        tokenExpiredAt: null,
        attemptCount: 0,
        isLocked: false,
      }
    });

    await tx.activityLog.create({
      data: {
        goodsId,
        userId,
        action: 'DELIVERY_ROLLBACK',
        fromStatus: 'DELIVERED',
        toStatus: 'READY'
      }
    });

    return { message: 'Delivery rolled back to READY' };
  });
}


}
