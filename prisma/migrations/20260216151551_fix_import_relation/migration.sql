/*
  Warnings:

  - You are about to drop the column `importedAt` on the `ImportBatch` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ImportBatch" DROP COLUMN "importedAt",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "duplicate" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "failed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "imported" INTEGER NOT NULL DEFAULT 0;
