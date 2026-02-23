-- CreateTable
CREATE TABLE "IncomingForm" (
    "id" TEXT NOT NULL,
    "goodsId" TEXT NOT NULL,
    "hasIssue" BOOLEAN NOT NULL,
    "bodyCheck" BOOLEAN NOT NULL,
    "engineCheck" BOOLEAN NOT NULL,
    "tireCheck" BOOLEAN NOT NULL,
    "paintCheck" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomingForm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IncomingForm_goodsId_key" ON "IncomingForm"("goodsId");

-- AddForeignKey
ALTER TABLE "IncomingForm" ADD CONSTRAINT "IncomingForm_goodsId_fkey" FOREIGN KEY ("goodsId") REFERENCES "Goods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
