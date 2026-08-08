-- 线索投放（Clue Supply，doc2.0/06 §九 供给面 / 18 传闻态）：
-- 传闻是个人认知事实，按 userId 隔离；unique(userId, clueKey) = 重复投放的收敛点。
CREATE TABLE "RumorSighting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clueKey" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceRefs" JSONB NOT NULL,
    "text" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "heardAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RumorSighting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RumorSighting_userId_clueKey_key" ON "RumorSighting"("userId", "clueKey");

CREATE INDEX "RumorSighting_userId_idx" ON "RumorSighting"("userId");
