import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common'
import { UsersService } from './users.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'
import { Role } from '@prisma/client'

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Roles(Role.ADMIN)
  @Get()
  async findAll() {
    return this.usersService.findAll()
  }

  @Roles(Role.ADMIN)
  @Post()
  async create(@Body() body: any) {
    return this.usersService.create(body)
  }

  @Roles(Role.ADMIN)
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    return this.usersService.update(id, body)
  }

  @Roles(Role.ADMIN)
  @Patch(':id/deactivate')
  async deactivate(@Param('id') id: string) {
    return this.usersService.softDelete(id)
  }
}