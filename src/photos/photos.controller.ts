import {
  Controller,
  Post,
  Param,
  UseInterceptors,
  UploadedFiles,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import { PhotosService } from './photos.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Roles } from 'src/auth/roles.decorator'
import { RolesGuard } from 'src/auth/roles.guard'
import { Role } from '@prisma/client'
import { ForbiddenException } from '@nestjs/common'
//import { Request } from 'express'
import type { Request as ExpressRequest } from 'express'

@Controller('photos')
export class PhotosController {
  constructor(private photosService: PhotosService) {}

  @UseGuards(JwtAuthGuard,RolesGuard)
  @Post(':goodsId')
  @UseInterceptors(FilesInterceptor('files', 10))
  async upload(
    @Param('goodsId') goodsId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('process') processType: string,
    @Req() req: any,
  ) {
    const role = req.user?.role

//KALAU UPLOAD UNTUK PDI
if (processType==='PDI' || processType==='PDI_STICKER'){
  if (role !== Role.ADMIN && role!==Role.PDI){
    throw new ForbiddenException('Only PDI Role can upload PDI Photos')
  }
}

//KALAU UPLOAD UNTUK REPAIR
if (processType==='REPAIR'){
  if (role === Role.PDI){
    throw new ForbiddenException('PDI Role cannot upload Repair Photos')
  }
}

//KALAU UPLOAD UNTUK INCOMING
if (processType==='INCOMING'){
  if (role !== Role.STAFF && role !== Role.ADMIN){
    throw new ForbiddenException('Only STAFF dan ADMIN Role can upload incoming Photos')
  }
}

    return this.photosService.uploadPhotos(goodsId, files, processType)
  }


// @UseGuards(JwtAuthGuard)
// @Post('upload-temp')
// @UseInterceptors(FilesInterceptor('files', 10))
// async uploadTemp(
//   @UploadedFiles() files: Express.Multer.File[],
// ) {
//   return this.photosService.uploadTemp(files)
// }

  
}
