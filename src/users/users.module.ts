import { Module } from '@nestjs/common'
import { UsersService } from './users.service'
import { UsersController } from './users.controller'

@Module({
  controllers:[UsersController],
  providers: [UsersService],
  exports: [UsersService], // ⬅️ WAJIB ADA INI
})
export class UsersModule {}
