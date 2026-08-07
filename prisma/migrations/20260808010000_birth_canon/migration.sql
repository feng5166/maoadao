-- CreateTable
CREATE TABLE "CatProfile" (
    "catId" TEXT NOT NULL,
    "profileVersion" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "corePreference" JSONB NOT NULL,
    "lifePatternSeed" JSONB NOT NULL,
    "discoveryTrait" JSONB NOT NULL,
    "behaviorSignature" JSONB NOT NULL,
    "socialSeed" JSONB NOT NULL,
    "leaveStyle" JSONB NOT NULL,
    "overrides" JSONB NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatProfile_pkey" PRIMARY KEY ("catId")
);

-- CreateTable
CREATE TABLE "SealedCatCanon" (
    "catId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SealedCatCanon_pkey" PRIMARY KEY ("catId")
);

-- CreateTable
CREATE TABLE "LifeImprint" (
    "id" TEXT NOT NULL,
    "catId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "delta" DOUBLE PRECISION NOT NULL,
    "sourceEventIds" TEXT[],
    "supersedesImprintId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LifeImprint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LifeImprint_catId_idx" ON "LifeImprint"("catId");

