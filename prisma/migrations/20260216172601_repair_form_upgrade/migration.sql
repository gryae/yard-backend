-- AlterTable
ALTER TABLE "RepairRecord" ADD COLUMN     "formData" JSONB,
ADD COLUMN     "isCompleted" BOOLEAN NOT NULL DEFAULT false;
