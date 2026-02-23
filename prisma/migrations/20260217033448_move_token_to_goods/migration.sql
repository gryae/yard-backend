/*
  Warnings:

  - You are about to drop the column `attemptCount` on the `Delivery` table. All the data in the column will be lost.
  - You are about to drop the column `deliveryToken` on the `Delivery` table. All the data in the column will be lost.
  - You are about to drop the column `isLocked` on the `Delivery` table. All the data in the column will be lost.
  - You are about to drop the column `tokenExpiredAt` on the `Delivery` table. All the data in the column will be lost.
  - You are about to drop the column `verificationCode` on the `Delivery` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[deliveryToken]` on the table `Goods` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Delivery_deliveryToken_key";

-- AlterTable
ALTER TABLE "Delivery" DROP COLUMN "attemptCount",
DROP COLUMN "deliveryToken",
DROP COLUMN "isLocked",
DROP COLUMN "tokenExpiredAt",
DROP COLUMN "verificationCode";

-- AlterTable
ALTER TABLE "Goods" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deliveryToken" TEXT,
ADD COLUMN     "isLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tokenExpiredAt" TIMESTAMP(3),
ADD COLUMN     "verificationCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Goods_deliveryToken_key" ON "Goods"("deliveryToken");
