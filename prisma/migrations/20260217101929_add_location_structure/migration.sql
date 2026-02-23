/*
  Warnings:

  - You are about to drop the column `slot` on the `Goods` table. All the data in the column will be lost.
  - You are about to drop the column `zone` on the `Goods` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[locationId]` on the table `Goods` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Goods" DROP COLUMN "slot",
DROP COLUMN "zone",
ADD COLUMN     "locationId" TEXT;

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "lane" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Location_zone_row_lane_key" ON "Location"("zone", "row", "lane");

-- CreateIndex
CREATE UNIQUE INDEX "Goods_locationId_key" ON "Goods"("locationId");

-- AddForeignKey
ALTER TABLE "Goods" ADD CONSTRAINT "Goods_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
