// import { Injectable, NotFoundException } from '@nestjs/common'
// import { PrismaService } from '../prisma/prisma.service'
// import sharp from 'sharp'
// import * as fs from 'fs'
// import * as path from 'path'
// import {v4 as uuid} from 'uuid'

// @Injectable()
// export class PhotosService {
//   constructor(private prisma: PrismaService) {}

// async uploadPhotos(
//   goodsId: string,
//   files: Express.Multer.File[],
//   processType: string,
// ) {
//   const goods = await this.prisma.goods.findUnique({
//     where: { id: goodsId },
//   })

//   if (!goods) throw new NotFoundException('Goods not found')

//   const uploadDir = path.join(
//     process.cwd(),      // 🔥 INI YANG PENTING
//     'uploads',
//     processType.toLowerCase(),
//   )

//   if (!fs.existsSync(uploadDir)) {
//     fs.mkdirSync(uploadDir, { recursive: true })
//   }

//   const savedPhotos: any[] = []

//   for (const file of files) {
//     const filename = `${goodsId}-${processType}-${uuid()}.jpg`
//     const filepath = path.join(uploadDir, filename)

//     await sharp(file.buffer)
//       .resize({ width: 1600 })
//       .jpeg({ quality: 80 })
//       .toFile(filepath)

//     const photo = await this.prisma.photo.create({
//       data: {
//         goodsId,
//         process: processType,
//         url: `/uploads/${processType.toLowerCase()}/${filename}`,
//       },
//     })

//     savedPhotos.push(photo)
//   }

//   return savedPhotos
// }


//   async uploadTemp(files: Express.Multer.File[]) {
// const uploadDir = path.join(
//   process.cwd(),
//   'uploads',
//   'temp',
// )

//   if (!fs.existsSync(uploadDir)) {
//     fs.mkdirSync(uploadDir, { recursive: true })
//   }

//   const saved: any[] = []

//   for (const file of files) {
//     const filename = `temp-${uuid()}.jpg`
//     const filepath = path.join(uploadDir, filename)

//     await sharp(file.buffer)
//       .resize({ width: 1600 })
//       .jpeg({ quality: 80 })
//       .toFile(filepath)

//     saved.push({
//       filename,
//       url: `/uploads/temp/${filename}`,
//     })
//   }

//   return saved
// }   
// }



////////////////////////ATASS INI UNTUK LOCAL BROOOOO, HIDUPKAN KALAU MAU LOCAL STORAGE////////////
//////////////////////// DI BAWAH INI UNTUK STORAGE CLOUDINARY ///////////////////////////////

import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import sharp from 'sharp'
import { v4 as uuid } from 'uuid'
import cloudinary from '../config/cloudinary'

@Injectable()
export class PhotosService {
  constructor(private prisma: PrismaService) {}

  async uploadPhotos(
    goodsId: string,
    files: Express.Multer.File[],
    processType: string,
  ) {
    const goods = await this.prisma.goods.findUnique({
      where: { id: goodsId },
    })

    if (!goods) throw new NotFoundException('Goods not found')

    const savedPhotos: any[] = []

    for (const file of files) {
      // 🔥 Compress dulu pakai sharp (memory)
      const compressedBuffer = await sharp(file.buffer)
        .resize({ width: 1600 })
        .jpeg({ quality: 80 })
        .toBuffer()

      // 🔥 Upload ke Cloudinary
      const uploadResult: any = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: `yard-v2/${processType.toLowerCase()}`,
            public_id: `${goodsId}-${processType}-${uuid()}`,
          },
          (error, result) => {
            if (error) reject(error)
            else resolve(result)
          },
        )

        stream.end(compressedBuffer)
      })

      // 🔥 Simpan URL ke DB
      const photo = await this.prisma.photo.create({
        data: {
          goodsId,
          process: processType,
          url: uploadResult.secure_url,
          publicId: uploadResult.public_id,
        },
      })

      savedPhotos.push(photo)
    }

    return savedPhotos
  }
}