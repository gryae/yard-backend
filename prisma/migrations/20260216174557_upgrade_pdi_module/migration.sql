-- AlterTable
ALTER TABLE "PDIRecord" ADD COLUMN     "formData" JSONB,
ADD COLUMN     "isCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stickerDate" TIMESTAMP(3),
ALTER COLUMN "result" DROP NOT NULL;
