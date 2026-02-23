/*
  Warnings:

  - A unique constraint covering the columns `[deliveryToken]` on the table `Delivery` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `deliveryToken` to the `Delivery` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tokenExpiredAt` to the `Delivery` table without a default value. This is not possible if the table is not empty.
  - Added the required column `verificationCode` to the `Delivery` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deliveryToken" TEXT NOT NULL,
ADD COLUMN     "isLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tokenExpiredAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "verificationCode" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_deliveryToken_key" ON "Delivery"("deliveryToken");
