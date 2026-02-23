import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service'
import { UsersService } from './users/users.service'
import { NestExpressApplication } from '@nestjs/platform-express'
import { join } from 'path'


async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  
  const prisma = app.get(PrismaService)
  // const usersService = app.get(UsersService)

  // const admin = await prisma.user.findFirst({
  //   where: { email: 'admin@yard.com' },
  // })

  // if (!admin) {
  //   await usersService.createAdmin()
  //   console.log('Admin created: admin@yard.com / admin123')
  // }

  app.enableCors({
    origin:['http://localhost:3000','http://10.110.204.24:3000'],
    credentials:true,
  })


    app.useStaticAssets(join(process.cwd(),'uploads'), {
    prefix: '/uploads/',
  })

  await app.listen(process.env.PORT ?? 3001,'0.0.0.0');
}
bootstrap();
