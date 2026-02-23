/*
  Warnings:

  - You are about to drop the column `bodyCheck` on the `IncomingForm` table. All the data in the column will be lost.
  - You are about to drop the column `engineCheck` on the `IncomingForm` table. All the data in the column will be lost.
  - You are about to drop the column `paintCheck` on the `IncomingForm` table. All the data in the column will be lost.
  - You are about to drop the column `tireCheck` on the `IncomingForm` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "IncomingForm" DROP COLUMN "bodyCheck",
DROP COLUMN "engineCheck",
DROP COLUMN "paintCheck",
DROP COLUMN "tireCheck";

-- CreateTable
CREATE TABLE "IncomingInspectionItem" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomingInspectionItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "IncomingInspectionItem" ADD CONSTRAINT "IncomingInspectionItem_formId_fkey" FOREIGN KEY ("formId") REFERENCES "IncomingForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
