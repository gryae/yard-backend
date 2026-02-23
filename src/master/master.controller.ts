import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Get,
  Query
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { MasterService } from './master.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'
import { Role } from '@prisma/client'

@Controller('master')
export class MasterController {
  constructor(private masterService: MasterService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async importExcel(@UploadedFile() file: any) {
    if (!file) {
      throw new Error('File not uploaded')
    }

    return this.masterService.importExcel(file)
  }


@Get('search')
async search(@Query('q') q: string) {
  return this.masterService.searchEngine(q)
}



}
