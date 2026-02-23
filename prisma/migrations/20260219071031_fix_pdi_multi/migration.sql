/*
  Warnings:

  - You are about to drop the column `formData` on the `PDIRecord` table. All the data in the column will be lost.
  - You are about to drop the column `isCompleted` on the `PDIRecord` table. All the data in the column will be lost.
  - You are about to drop the column `result` on the `PDIRecord` table. All the data in the column will be lost.
  - You are about to drop the column `stickerDate` on the `PDIRecord` table. All the data in the column will be lost.
  - Added the required column `supervisorName` to the `PDIRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `technicianName` to the `PDIRecord` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PDIRecord" DROP COLUMN "formData",
DROP COLUMN "isCompleted",
DROP COLUMN "result",
DROP COLUMN "stickerDate",
ADD COLUMN     "pdiDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "supervisorName" TEXT NOT NULL,
ADD COLUMN     "technicianName" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "PDIItem" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "PDIItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PDIItem" ADD CONSTRAINT "PDIItem_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "PDIRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
