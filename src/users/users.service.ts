// import { Injectable } from '@nestjs/common'
// import { PrismaService } from '../prisma/prisma.service'
// import { Role } from '@prisma/client'
// import * as bcrypt from 'bcrypt'

// @Injectable()
// export class UsersService {
//   constructor(private prisma: PrismaService) {}

//   async createAdmin() {
//     const hashed = await bcrypt.hash('admin123', 10)

//     return this.prisma.user.create({
//       data: {
//         name: 'Super Admin',
//         email: 'admin@yard.com',
//         password: hashed,
//         role: Role.ADMIN,
//       },
//     })
//   }


// }


import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Role } from '@prisma/client'
import * as bcrypt from 'bcrypt'

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    })
  }

  async create(data: any) {
    const hashed = await bcrypt.hash(data.password, 10)

    return this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashed,
        role: data.role,
      },
    })
  }

  async update(id: string, data: any) {
    const updateData: any = {
      name: data.name,
      email: data.email,
      role: data.role,
      isActive: data.isActive,
    }

    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10)
    }

    return this.prisma.user.update({
      where: { id },
      data: updateData,
    })
  }

  async softDelete(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    })
  }


    async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    })
  }
}