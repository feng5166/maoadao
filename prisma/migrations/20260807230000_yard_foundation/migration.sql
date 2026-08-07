-- AlterTable
ALTER TABLE "User" ADD COLUMN     "yardAccess" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Home" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fish" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Home_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Yard" (
    "id" TEXT NOT NULL,
    "homeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Yard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YardSlot" (
    "id" TEXT NOT NULL,
    "yardId" TEXT NOT NULL,
    "slotKey" TEXT NOT NULL,

    CONSTRAINT "YardSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Placement" (
    "id" TEXT NOT NULL,
    "yardId" TEXT NOT NULL,
    "slotKey" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "Placement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnedItem" (
    "id" TEXT NOT NULL,
    "homeId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeGrant" (
    "homeId" TEXT NOT NULL,
    "batchKey" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeGrant_pkey" PRIMARY KEY ("homeId","batchKey")
);

-- CreateTable
CREATE TABLE "WindowSettlement" (
    "id" TEXT NOT NULL,
    "yardId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "windowIndex" INTEGER NOT NULL,
    "rulesVersion" TEXT NOT NULL,
    "placementSnapshot" JSONB NOT NULL,
    "weather" TEXT NOT NULL,
    "settledAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WindowSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatVisit" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "yardId" TEXT NOT NULL,
    "catId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "windowIndex" INTEGER NOT NULL,
    "slotKey" TEXT,
    "itemKey" TEXT,
    "arriveAt" TIMESTAMP(3) NOT NULL,
    "leaveAt" TIMESTAMP(3) NOT NULL,
    "behaviors" JSONB NOT NULL,
    "leftBehind" JSONB NOT NULL,
    "traces" JSONB NOT NULL,
    "visibility" TEXT NOT NULL,
    "rulesVersion" TEXT NOT NULL,

    CONSTRAINT "CatVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Observation" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatOpportunityState" (
    "catId" TEXT NOT NULL,
    "yardId" TEXT NOT NULL,
    "consecutiveEligibleMisses" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatOpportunityState_pkey" PRIMARY KEY ("catId","yardId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Home_userId_key" ON "Home"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Yard_homeId_key" ON "Yard"("homeId");

-- CreateIndex
CREATE UNIQUE INDEX "YardSlot_yardId_slotKey_key" ON "YardSlot"("yardId", "slotKey");

-- CreateIndex
CREATE INDEX "Placement_yardId_placedAt_idx" ON "Placement"("yardId", "placedAt");

-- CreateIndex
CREATE INDEX "OwnedItem_homeId_idx" ON "OwnedItem"("homeId");

-- CreateIndex
CREATE UNIQUE INDEX "WindowSettlement_yardId_dayKey_windowIndex_key" ON "WindowSettlement"("yardId", "dayKey", "windowIndex");

-- CreateIndex
CREATE INDEX "CatVisit_yardId_dayKey_idx" ON "CatVisit"("yardId", "dayKey");

-- CreateIndex
CREATE INDEX "CatVisit_catId_dayKey_idx" ON "CatVisit"("catId", "dayKey");

-- CreateIndex
CREATE INDEX "Observation_viewerId_idx" ON "Observation"("viewerId");

-- CreateIndex
CREATE UNIQUE INDEX "Observation_viewerId_visitId_type_key" ON "Observation"("viewerId", "visitId", "type");

-- AddForeignKey
ALTER TABLE "Yard" ADD CONSTRAINT "Yard_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YardSlot" ADD CONSTRAINT "YardSlot_yardId_fkey" FOREIGN KEY ("yardId") REFERENCES "Yard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_yardId_fkey" FOREIGN KEY ("yardId") REFERENCES "Yard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnedItem" ADD CONSTRAINT "OwnedItem_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeGrant" ADD CONSTRAINT "HomeGrant_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatVisit" ADD CONSTRAINT "CatVisit_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "WindowSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "CatVisit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

