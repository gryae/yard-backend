import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { GoodsStatus } from '@prisma/client'
import { GoodsFlowService } from 'src/goods/goods-flow.service'
import PDFDocument from 'pdfkit'
import type { Response } from 'express'
import path from 'path'
import { randomUUID } from 'crypto'
import QRCode from 'qrcode'
import { NotFoundException } from '@nestjs/common'

@Injectable()
export class DeliveryService {
  constructor(
    private prisma: PrismaService,
    private goodsFlow: GoodsFlowService,
  ) {}

  // ===============================
  // GENERATORS
  // ===============================

  private generateSuratJalanNumber() {
    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    const random = Math.floor(1000 + Math.random() * 9000)

    return `SJ-${yyyy}${mm}${dd}-${random}`
  }

  private generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString()
  }

  // ===============================
  // PDF GENERATOR
  // ===============================


async generatePDF(deliveryId: string, res: Response) {
  const delivery = await this.prisma.delivery.findUnique({
    where: { id: deliveryId },
    include: {
      items: {
        include: {
          goods: {
            include: { unit: true },
          },
        },
      },
    },
  });

  if (!delivery) {
    throw new BadRequestException('Delivery not found');
  }

  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename=SJ-${delivery.suratJalanNumber}.pdf`,
  );

  doc.pipe(res);

  // --- HEADER SECTION ---
  const logoPath = path.join(process.cwd(), 'public/logo.png');
  doc.image(logoPath, 50, 45, { width: 100 });

  doc
    .fontSize(20)
    .font('Helvetica-Bold')
    .text('SURAT JALAN', 0, 50, { align: 'right' });

  doc
    .fontSize(10)
    .font('Helvetica-Bold')
    .fillColor('#444444')
    .text(`No. Dokumen: ${delivery.suratJalanNumber}`, { align: 'right' });
  
  doc
    .font('Helvetica')
    .fontSize(9)
    .text(`Tanggal Cetak: ${new Date().toLocaleString('id-ID')}`, { align: 'right' });

  doc.moveDown(2);
  doc.strokeColor('#eeeeee').lineWidth(1).moveTo(50, 105).lineTo(550, 105).stroke();

  // --- INFO BOX SECTION ---
  doc.moveDown(2);
  const infoTop = doc.y;

  // Left Column (Company/Sender Info - Static or from Config)
  doc
    .fontSize(10)
    .font('Helvetica-Bold')
    .text('PENGIRIM:', 50, infoTop)
    .font('Helvetica')
    .fontSize(9)
    .text('PT. LOGISTIK TEST TEST')
    .text('Kawasan Industri Jababeka, Bekasi')
    .text('Telp: (021) 8888-xxxx');

  // Right Column (Driver & Shipment Info)
  doc
    .fontSize(10)
    .font('Helvetica-Bold')
    .text('INFORMASI PENGIRIMAN:', 300, infoTop)
    .font('Helvetica')
    .fontSize(9)
    .text(`Nama Driver    : ${delivery.driverName}`, 300)
    .text(`No. Telepon    : ${delivery.driverPhone}`, 300)
    .text(`Jenis Armada   : ${delivery.jenisPengiriman}`, 300)
    .text(`Tanggal Kirim  : ${new Date(delivery.createdAt).toLocaleDateString('id-ID')}`, 300);

  doc.moveDown(3);

  // --- TABLE HEADER ---
  const tableTop = doc.y;
  const colNo = 50;
  const colUnit = 80;
  const colMesin = 200;
  const colPol = 300;
  const colTujuan = 380;
  const colQR = 490;

  // Draw Header Background
  doc
    .rect(50, tableTop, 500, 20)
    .fill('#f0f0f0');

  doc
    .fillColor('#000000')
    .font('Helvetica-Bold')
    .fontSize(9)
    .text('NO', colNo + 5, tableTop + 6)
    .text('NO. RANGKA', colUnit, tableTop + 6)
    .text('NO. MESIN', colMesin, tableTop + 6)
    .text('NO. POL', colPol, tableTop + 6)
    .text('TUJUAN', colTujuan, tableTop + 6)
    .text('QR BAST', colQR, tableTop + 6);

  // --- TABLE BODY ---
  let currentY = tableTop + 20;
  doc.font('Helvetica').fontSize(8);

  for (let i = 0; i < delivery.items.length; i++) {
    const item = delivery.items[i];
    const rowHeight = 60; // Ditinggikan supaya QR Code muat rapi

    // Zebra striping (optional)
    if (i % 2 !== 0) {
      doc.rect(50, currentY, 500, rowHeight).fill('#fafafa');
    }

    doc
      .fillColor('#000000')
      .text(String(i + 1), colNo + 5, currentY + 25)
      .font('Helvetica-Bold')
      .text(item.goods.unit.chassisNumber, colUnit, currentY + 25)
      .font('Helvetica')
      .text(item.goods.unit.engineNumber, colMesin, currentY + 25)
      .text(item.noPol, colPol, currentY + 25)
      .text(item.tujuanPengiriman, colTujuan, currentY + 20, { width: 100 });

    // Generate & Draw QR Code
    const publicUrl = `${process.env.FRONTEND_URL}/receiving/${item.goodsId}?token=${item.goods.deliveryToken}`;
    const qrImage = await QRCode.toDataURL(publicUrl);
    doc.image(qrImage, colQR, currentY + 5, { width: 50 });

    // Row Bottom Border
    doc
      .strokeColor('#eeeeee')
      .lineWidth(0.5)
      .moveTo(50, currentY + rowHeight)
      .lineTo(550, currentY + rowHeight)
      .stroke();

    currentY += rowHeight;

    // Handle Page Break
    if (currentY > 700) {
      doc.addPage();
      currentY = 50;
    }
  }

  // --- FOOTER SECTION (Tanda Tangan) ---
  const footerTop = Math.max(currentY + 40, doc.y + 40);
  
  if (footerTop > 700) doc.addPage();

  doc
    .fontSize(9)
    .font('Helvetica-Bold')
    .text('Catatan:', 50, footerTop - 20)
    .font('Helvetica')
    .text(delivery.catatan || '-', 50, footerTop - 5);

  const sigY = footerTop + 40;
  const sigWidth = 150;

  // Tanda Tangan Header
  doc.font('Helvetica-Bold').fontSize(9);
  doc.text('Dibuat Oleh,', 50, sigY, { width: sigWidth, align: 'center' });
  doc.text('Driver / Pembawa,', 225, sigY, { width: sigWidth, align: 'center' });
  doc.text('Diterima Oleh,', 400, sigY, { width: sigWidth, align: 'center' });

  // Tanda Tangan Line
  doc.moveDown(5);
  const lineY = doc.y;
  doc.text('( ____________________ )', 50, lineY, { width: sigWidth, align: 'center' });
  doc.text(`( ${delivery.driverName} )`, 225, lineY, { width: sigWidth, align: 'center' });
  doc.text('( ____________________ )', 400, lineY, { width: sigWidth, align: 'center' });

  doc.fontSize(7).fillColor('#999999').text('Putih: Kantor | Merah: Driver | Kuning: Penerima', 50, 780, { align: 'center' });

  doc.end();
}

  // ===============================
  // CREATE MULTI DELIVERY
  // ===============================

 async createMultiDelivery(
  data: {
    driverName: string
    driverPhone: string
    jenisPengiriman: string
    catatan?: string
    items: {
      goodsId: string
      noPol: string
      tujuanPengiriman: string
    }[]
  },
  userId: string,
) {

  if (!data.items || data.items.length === 0) {
    throw new BadRequestException('No goods selected')
  }

  return this.prisma.$transaction(async (tx) => {

    const goodsIds = data.items.map(i => i.goodsId)

    const goodsList = await tx.goods.findMany({
      where: { id: { in: goodsIds } },
    })

    if (goodsList.length !== goodsIds.length) {
      throw new BadRequestException('Some goods not found')
    }

    for (const goods of goodsList) {
      if (goods.currentStatus !== GoodsStatus.READY) {
        throw new BadRequestException(
          `Goods ${goods.id} is not READY`,
        )
      }
    }

    const suratJalanNumber = this.generateSuratJalanNumber()

    const delivery = await tx.delivery.create({
      data: {
        suratJalanNumber,
        driverName: data.driverName,
        driverPhone: data.driverPhone,
        jenisPengiriman: data.jenisPengiriman,
        catatan: data.catatan,
        deliveredAt: new Date(),
      },
    })

    for (const item of data.items) {

      // 1️⃣ Create DeliveryItem
      await tx.deliveryItem.create({
        data: {
          deliveryId: delivery.id,
          goodsId: item.goodsId,
          noPol: item.noPol,
          tujuanPengiriman: item.tujuanPengiriman,
        },
      })

      // 2️⃣ CLEAR LOCATION (INI YANG PENTING 🔥)
      await tx.goods.update({
        where: { id: item.goodsId },
        data: {
          locationId: null,   // kosongin zona
        },
      })

      // 3️⃣ Change Status READY → DELIVERED
      // await this.goodsFlow.changeStatus(
      //   item.goodsId,
      //   userId,
      //   GoodsStatus.READY,
      //   GoodsStatus.DELIVERED,
      //   'GOODS_DELIVERED',
      // )

      // 4️⃣ Generate Token
await tx.goods.update({
  where: { id: item.goodsId },
  data: {
    currentStatus: GoodsStatus.DELIVERED,
    locationId: null,
    deliveryToken: randomUUID(),
    verificationCode: this.generateVerificationCode(),
    tokenExpiredAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    attemptCount: 0,
    isLocked: false,
  },
})

//3️⃣ Change Status READY → DELIVERED
await tx.activityLog.create({
  data: {
    goodsId: item.goodsId,
    userId,
    action: 'GOODS_DELIVERED',
    fromStatus: GoodsStatus.READY,
    toStatus: GoodsStatus.DELIVERED,
  },
})
    }

    return {
      message: 'Delivery created successfully',
      suratJalanNumber,
      totalGoods: data.items.length,
    }
  })
}

async verifyDeliveryToken(
  goodsId: string,
  token: string,
  verificationCode: string,
) {

  const goods = await this.prisma.goods.findUnique({
    where: { id: goodsId },
  })

  if (!goods) throw new BadRequestException('Goods not found')

  if (goods.currentStatus !== GoodsStatus.DELIVERED) {
    throw new BadRequestException('Goods not in DELIVERED status')
  }

  if (goods.isLocked) {
    throw new BadRequestException('Token locked')
  }

  if (!goods.deliveryToken || goods.deliveryToken !== token) {
    throw new BadRequestException('Invalid token')
  }

  if (!goods.tokenExpiredAt || new Date() > goods.tokenExpiredAt) {
    throw new BadRequestException('Token expired')
  }

  if (goods.verificationCode !== verificationCode) {

    const attempts = goods.attemptCount + 1

    await this.prisma.goods.update({
      where: { id: goodsId },
      data: {
        attemptCount: attempts,
        isLocked: attempts >= 5,
      },
    })

    throw new BadRequestException('Wrong verification code')
  }

  return {
    message: 'Token verified. Please print BAST and upload required photos.',
  }
}


async finalizeReceiving(
  goodsId: string,
  receiverName: string,
) {

  const goods = await this.prisma.goods.findUnique({
    where: { id: goodsId },
  })

  if (!goods) throw new BadRequestException('Goods not found')

  if (goods.currentStatus !== GoodsStatus.DELIVERED) {
    throw new BadRequestException('Goods not in DELIVERED status')
  }

  const photoCount = await this.prisma.photo.count({
    where: {
      goodsId,
      process: 'RECEIVING',
    },
  })

  if (photoCount < 5) {
    throw new BadRequestException('5 receiving photos required')
  }

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001'

  await this.goodsFlow.changeStatus(
  goodsId,
  SYSTEM_USER_ID, // karena receiver bukan user login
  GoodsStatus.DELIVERED,
  GoodsStatus.RECEIVED,
  'GOODS_RECEIVED',
)

await this.prisma.goods.update({
  where: { id: goodsId },
  data: {
    attemptCount: 0,
    isLocked: true,
  },
})


 await this.prisma.bASTRecord.upsert({
  where: { goodsId },
  update: {
    receiverName,
    completedAt: new Date(),
  },
  create: {
    goodsId,
    receiverName,
    completedAt: new Date(),
  },
})

  return { message: 'Goods successfully received' }
}




async generateBAST(
  goodsId: string,
  token: string,
  res: Response,
) {
  const goods = await this.prisma.goods.findUnique({
    where: { id: goodsId },
    include: {
      unit: true,
      deliveryItems: {
        include: {
          delivery: true,
        },
      },
    },
  });

  if (!goods) {
    throw new BadRequestException('Goods not found');
  }

  if (goods.currentStatus !== GoodsStatus.DELIVERED) {
    throw new BadRequestException('Goods not in DELIVERED status');
  }

  if (!goods.deliveryToken || goods.deliveryToken !== token) {
    throw new BadRequestException('Invalid token');
  }

  if (!goods.tokenExpiredAt || new Date() > goods.tokenExpiredAt) {
    throw new BadRequestException('Token expired');
  }

  if (goods.isLocked) {
    throw new BadRequestException('Token locked');
  }

  const doc = new PDFDocument({ size: 'A4', margin: 70 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename=BAST-${goods.unit.engineNumber}.pdf`,
  );

  doc.pipe(res);

  // --- HEADER & LOGO ---
  const logoPath = path.join(process.cwd(), 'public/logo.png');
  doc.image(logoPath, 70, 50, { width: 90 });

  doc
    .fontSize(14)
    .font('Helvetica-Bold')
    .text('BERITA ACARA SERAH TERIMA BARANG', { align: 'center' })
    .moveDown(0.2);
  
  doc
    .fontSize(9)
    .font('Helvetica')
    .fillColor('#666666')
    .text(`Ref No: BAST/${goods.unit.engineNumber}/${new Date().getTime()}`, { align: 'center' });

  doc.moveDown(2);
  doc.strokeColor('#dddddd').lineWidth(1).moveTo(70, 115).lineTo(525, 115).stroke();

  // --- OPENING SECTION ---
  doc.moveDown(3).fillColor('#000000').fontSize(10);
  const today = new Date();
  
  doc.font('Helvetica').text('Pada hari ini, kami yang bertanda tangan di bawah ini menyatakan telah melakukan serah terima unit kendaraan dengan rincian waktu sebagai berikut:');
  
  doc.moveDown();
  const dateInfoX = 100;
  doc.font('Helvetica-Bold').text('Hari', dateInfoX);
  doc.font('Helvetica').text(`: ${today.toLocaleDateString('id-ID', { weekday: 'long' })}`, dateInfoX + 70, doc.y - 12);
  
  doc.font('Helvetica-Bold').text('Tanggal', dateInfoX);
  doc.font('Helvetica').text(`: ${today.getDate()} ${today.toLocaleDateString('id-ID', { month: 'long' })} ${today.getFullYear()}`, dateInfoX + 70, doc.y - 12);

  doc.moveDown(2);
  doc.font('Helvetica').text('Adapun rincian unit yang diserahterimakan adalah sebagai berikut:');

  // --- UNIT DETAIL BOX (TERSTRUKTUR) ---
  doc.moveDown();
  const boxTop = doc.y;
  doc.rect(70, boxTop, 455, 140).fill('#fbfbfb').stroke('#eeeeee');
  
  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(11);
  doc.text('SPESIFIKASI UNIT', 85, boxTop + 15);
  
  doc.fontSize(10).font('Helvetica');
  const labelX = 85;
  const valueX = 185;
  let currentY = boxTop + 40;

  const drawRow = (label: string, value: string) => {
    doc.font('Helvetica-Bold').text(label, labelX, currentY);
    doc.font('Helvetica').text(`: ${value}`, valueX, currentY);
    currentY += 18;
  };

  drawRow('Nama Barang', `${goods.unit.brand || '-'} ${goods.unit.vehicleType || ''}`);
  drawRow('No. Rangka', goods.unit.chassisNumber);
  drawRow('No. Mesin', goods.unit.engineNumber);
  drawRow('Warna', goods.unit.color || '-');
  drawRow('Tujuan', goods.deliveryItems[0]?.tujuanPengiriman || '-');
  drawRow('Jumlah', '1 (Satu) Unit');

  // --- CLOSING ---
  doc.moveDown(3);
  doc.font('Helvetica').fontSize(10).text(
    'Seluruh pemeriksaan kondisi fisik kendaraan telah dilakukan secara bersama-sama dan diterima dalam keadaan baik serta sesuai dengan spesifikasi yang tercantum di atas.',
    { align: 'justify', lineGap: 2 }
  );

  doc.moveDown();
  doc.text('Demikian Berita Acara Serah Terima ini dibuat dalam rangkap 2 (dua) untuk dipergunakan sebagaimana mestinya.');

  // --- SIGNATURE SECTION ---
  doc.moveDown(5);
  const startY = doc.y;
  const colWidth = 150;

  doc.font('Helvetica-Bold').fontSize(10);
  doc.text('YANG MENERIMA,', 70, startY, { width: colWidth, align: 'center' });
  doc.text('YANG MENYERAHKAN,', 222, startY, { width: colWidth, align: 'center' });
  doc.text('DISAKSIKAN OLEH,', 375, startY, { width: colWidth, align: 'center' });

  doc.moveDown(5);
  const endY = doc.y;
  doc.font('Helvetica');
  doc.text('( ____________________ )', 70, endY, { width: colWidth, align: 'center' });
  
  // Ambil nama driver dari delivery jika ada
  const driverName = goods.deliveryItems[0]?.delivery?.driverName || '____________________';
  doc.text(`( ${driverName} )`, 222, endY, { width: colWidth, align: 'center' });
  
  doc.text('( ____________________ )', 375, endY, { width: colWidth, align: 'center' });

  doc.end();
}



async unlockToken(goodsId: string) {

  const goods = await this.prisma.goods.findUnique({
    where: { id: goodsId },
  })

  if (!goods) {
    throw new BadRequestException('Goods not found')
  }

  if (!goods.isLocked) {
    return { message: 'Token is not locked' }
  }

  await this.prisma.goods.update({
    where: { id: goodsId },
    data: {
      attemptCount: 0,
      isLocked: false,
    },
  })

  return { message: 'Token unlocked successfully' }
}

  
async getDeliveryDetail(id: string) {

  const delivery = await this.prisma.delivery.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          goods: {
            include: {
              unit: true,
              bast: true,
            },
          },
        },
      },
    },
  })

  if (!delivery) {
    throw new BadRequestException('Delivery not found')
  }

  return delivery
}


async getDeliveryByGoods(goodsId: string) {

  const item = await this.prisma.deliveryItem.findFirst({
    where: { goodsId },
    include: {
      delivery: true,
    },
  })

  if (!item) {
    return { exists: false }
  }

  return {
    exists: true,
    deliveryId: item.delivery.id,
  }
}


async markCompleted(deliveryId: string, userId: string) {
  return this.prisma.$transaction(async (tx) => {

    // 1️⃣ Cari delivery + goods
    const delivery = await tx.delivery.findUnique({
      where: { id: deliveryId },
      include: {
        items: {
          include: {
            goods: true
          }
        }
      }
    })

    if (!delivery) {
      throw new NotFoundException('Delivery not found')
    }

    if (delivery.completedAt) {
      throw new BadRequestException('Delivery already completed')
    }

    const goodsItem = delivery.items[0]  // karena 1 delivery = 1 goods

    if (!goodsItem) {
      throw new BadRequestException('No goods found in delivery')
    }

    if (goodsItem.goods.currentStatus !== 'RECEIVED') {
  throw new BadRequestException('Unit must be RECEIVED before complete')
}
    // 2️⃣ Update delivery
    await tx.delivery.update({
      where: { id: deliveryId },
      data: {
        completedAt: new Date(),
      }
    })

    // 3️⃣ Update goods status
    await tx.goods.update({
      where: { id: goodsItem.goodsId },
      data: {
        currentStatus: 'COMPLETED'
      }
    })

    // 4️⃣ Activity Log
    await tx.activityLog.create({
      data: {
        goodsId: goodsItem.goodsId,
        userId,
        action: 'DELIVERY_COMPLETED',
        fromStatus: 'RECEIVED',
        toStatus: 'COMPLETED',
      }
    })

    return { message: 'Delivery marked as completed' }
  })
}

}
