import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import * as XLSX from 'xlsx'
import { Express } from 'express'

@Injectable()
export class MasterService {
  constructor(private prisma: PrismaService) {}

async importExcel(file: any) {
  if (!file) {
    throw new Error('File not uploaded')
  }

  const workbook = XLSX.read(file.buffer, { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows: any[] = XLSX.utils.sheet_to_json(sheet)

  if (!rows.length) {
    throw new Error('Excel file is empty')
  }

  // ✅ Validate Header
  if (!rows[0]['No Mesin']) {
    throw new Error('Invalid Excel format: Column "No Mesin" not found')
  }

  let imported = 0
  let duplicate = 0
  let failed = 0

  // ✅ Create import batch log
  const batch = await this.prisma.importBatch.create({
    data: {
      fileName: file.originalname,
      totalRows: rows.length,
    },
  })

  for (const raw of rows) {
    try {
      const engineNumber = raw['No Mesin']?.toString().trim()

      if (!engineNumber) {
        failed++
        continue
      }

      // 🔎 Check duplicate
      const existing = await this.prisma.unitMaster.findUnique({
        where: { engineNumber },
      })

      if (existing) {
        duplicate++
        continue
      }

      // 🧠 Safe Date Parsing (avoid 1900 bug)
      const safeDate = (value: any) => {
        if (!value) return null
        const date = new Date(value)
        if (isNaN(date.getTime())) return null
        if (date.getFullYear() < 2000) return null
        return date
      }

      await this.prisma.unitMaster.create({
        data: {
          blNumber: raw['BL']?.toString().trim() || null,
          containerNumber: raw['Container']?.toString().trim() || null,
          vehicleType: raw['Jenis Kendaraan']?.toString().trim() || null,
          brand: raw['Merk Kendaraan']?.toString().trim() || null,
          engineNumber,
          chassisNumber: raw['No kerangka']?.toString().trim() || null,
          color: raw['Warna']?.toString().trim() || null,
          dateYard: safeDate(raw['Date Yard']),
          dateETA: safeDate(raw['Date ETA']),
          importBatchId: batch.id,
        },
      })

      imported++
    } catch (err) {
      console.error('Import error:', err)
      failed++
    }
  }

  // ✅ Update import batch summary
  await this.prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      imported,
      duplicate,
      failed,
    },
  })

  return {
    imported,
    duplicate,
    failed,
  }
}

async searchEngine(q: string) {
  if (!q) return []

  const units = await this.prisma.unitMaster.findMany({
    where: {
      engineNumber: {
        contains: q,
        mode: 'insensitive',
      },
    },
    take: 10,
    include: {
      goods: {
        select: { id: true,
          currentStatus:true
         },
      },
    },
  })

  return units.map(unit => ({
    id: unit.id,
    engineNumber: unit.engineNumber,
    chassisNumber: unit.chassisNumber,
    brand: unit.brand,
    vehicleType: unit.vehicleType,
    currentStatus : unit.goods?.currentStatus ?? null,
  }))
}

}
