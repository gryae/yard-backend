/*
  Warnings:

  - A unique constraint covering the columns `[qrCode]` on the table `Goods` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `qrCode` to the `Goods` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Goods" ADD COLUMN     "qrCode" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Goods_qrCode_key" ON "Goods"("qrCode");
