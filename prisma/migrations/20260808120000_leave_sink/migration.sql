-- Leave Behind → Sink（19 三类资源，2026-08-08 拍板）：
-- 岛材钱包（可消耗特殊材料）+ 纪念物（不可消费，只进历史/收藏，挂来访溯源）。
CREATE TABLE "HomeMaterial" (
    "homeId" TEXT NOT NULL,
    "materialKey" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeMaterial_pkey" PRIMARY KEY ("homeId","materialKey")
);

CREATE TABLE "Memento" (
    "id" TEXT NOT NULL,
    "homeId" TEXT NOT NULL,
    "mementoKey" TEXT NOT NULL,
    "sourceVisitId" TEXT,
    "acquiredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Memento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Memento_homeId_idx" ON "Memento"("homeId");
