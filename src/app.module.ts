import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core'
import { RolesGuard } from './auth/roles.guard'
import { MasterModule } from './master/master.module';
import { GoodsModule } from './goods/goods.module';
import { PhotosModule } from './photos/photos.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { LocationModule } from './location/location.module';


@Module({
  imports: [AuthModule, UsersModule, PrismaModule, ConfigModule.forRoot({isGlobal: true}), MasterModule, GoodsModule, PhotosModule, DeliveryModule, DashboardModule, LocationModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
