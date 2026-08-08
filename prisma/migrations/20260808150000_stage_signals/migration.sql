-- 20 心流阶段观测（D1–D5 Signal 推导，2026-08-08）：
-- SurfaceView = 界面日见事实（analytics 层，世界侧永不读取）；
-- StageSignal = 由领域事实推导的 Signal 快照（可全量重算，非事实源）。
CREATE TABLE "SurfaceView" (
    "userId" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "firstAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurfaceView_pkey" PRIMARY KEY ("userId","surface","dayKey")
);

CREATE TABLE "StageSignal" (
    "userId" TEXT NOT NULL,
    "signal" TEXT NOT NULL,
    "firstAt" TIMESTAMP(3) NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "logicVersion" TEXT NOT NULL,

    CONSTRAINT "StageSignal_pkey" PRIMARY KEY ("userId","signal")
);
