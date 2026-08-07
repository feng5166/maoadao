-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'anonymous',
    "email" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "notifyDaily" BOOLEAN NOT NULL DEFAULT true,
    "recoveryCode" TEXT,
    "passwordHash" TEXT,
    "inviteCode" TEXT,
    "inviteBatch" TEXT,
    "lastSeenDay" INTEGER,
    "visitDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "lastActiveAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cat" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "name" TEXT NOT NULL,
    "isNpc" BOOLEAN NOT NULL DEFAULT false,
    "boldness" INTEGER NOT NULL,
    "sociability" INTEGER NOT NULL,
    "diligence" INTEGER NOT NULL,
    "personaTags" TEXT[],
    "role" TEXT,
    "goal" TEXT,
    "ownerNick" TEXT,
    "renamedAt" TIMESTAMP(3),
    "appearance" TEXT NOT NULL,
    "portraitUrl" TEXT,
    "arrivalPhotoUrl" TEXT,
    "firstWords" TEXT,
    "arrivalWorldDay" INTEGER NOT NULL DEFAULT 0,
    "firstTickDay" INTEGER NOT NULL DEFAULT 0,
    "bio" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatState" (
    "catId" TEXT NOT NULL,
    "coins" INTEGER NOT NULL DEFAULT 50,
    "energy" INTEGER NOT NULL DEFAULT 100,
    "mood" TEXT NOT NULL DEFAULT '平静',
    "location" TEXT NOT NULL DEFAULT '自家小屋',
    "updatedDay" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CatState_pkey" PRIMARY KEY ("catId")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "catId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "acquiredDay" INTEGER NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relationship" (
    "id" TEXT NOT NULL,
    "catAId" TEXT NOT NULL,
    "catBId" TEXT NOT NULL,
    "affinity" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL DEFAULT 'acquaintance',
    "lastInteractionDay" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Relationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Storyline" (
    "id" TEXT NOT NULL,
    "catId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "step" INTEGER NOT NULL DEFAULT 0,
    "lastAdvanceDay" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL,
    "startDay" INTEGER NOT NULL,
    "endDay" INTEGER,

    CONSTRAINT "Storyline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "segment" TEXT NOT NULL DEFAULT 'morning',
    "catId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'success',
    "data" JSONB NOT NULL,
    "deltas" JSONB NOT NULL,
    "targetId" TEXT,
    "threadKey" TEXT,
    "threadStep" INTEGER,
    "contentValue" INTEGER NOT NULL DEFAULT 1,
    "isMain" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiaryEntry" (
    "id" TEXT NOT NULL,
    "catId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "mood" TEXT NOT NULL,
    "eventIds" TEXT[],
    "generatedBy" TEXT NOT NULL DEFAULT 'llm',
    "form" TEXT NOT NULL DEFAULT 'diary',
    "promptVersion" TEXT,
    "modelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiaryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TickRun" (
    "targetDay" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "simulationCompletedAt" TIMESTAMP(3),
    "narrationCompletedAt" TIMESTAMP(3),
    "narrationAttempts" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,

    CONSTRAINT "TickRun_pkey" PRIMARY KEY ("targetDay")
);

-- CreateTable
CREATE TABLE "WorldState" (
    "id" INTEGER NOT NULL,
    "day" INTEGER NOT NULL DEFAULT 0,
    "season" TEXT NOT NULL DEFAULT '夏',
    "weather" TEXT NOT NULL DEFAULT '晴',
    "lastTickAt" TIMESTAMP(3),
    "adoptionPaused" BOOLEAN NOT NULL DEFAULT false,
    "wechatPaused" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WorldState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "windowOpenUntil" TIMESTAMP(3),
    "boundAt" TIMESTAMP(3) NOT NULL,
    "mutedAt" TIMESTAMP(3),
    "giftSentAt" TIMESTAMP(3),
    "replyDay" INTEGER NOT NULL DEFAULT 0,
    "repliesInDay" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShortLink" (
    "code" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShortLink_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "WechatMessageLog" (
    "id" TEXT NOT NULL,
    "openId" TEXT NOT NULL,
    "userId" TEXT,
    "catName" TEXT,
    "text" TEXT NOT NULL,
    "matched" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WechatMessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "catId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "link" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "sendAfter" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "claimId" TEXT,

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryEntry" (
    "id" TEXT NOT NULL,
    "catId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "refId" TEXT,
    "importance" INTEGER NOT NULL DEFAULT 3,
    "visibility" TEXT NOT NULL DEFAULT 'public',

    CONSTRAINT "MemoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IslandNews" (
    "id" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "catId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IslandNews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerNudge" (
    "id" TEXT NOT NULL,
    "catId" TEXT NOT NULL,
    "message" TEXT,
    "suggestion" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "consumedDay" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerNudge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Portrait" (
    "catId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mime" TEXT NOT NULL DEFAULT 'image/jpeg',
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portrait_pkey" PRIMARY KEY ("catId")
);

-- CreateTable
CREATE TABLE "CatPose" (
    "catId" TEXT NOT NULL,
    "pose" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mime" TEXT NOT NULL DEFAULT 'image/jpeg',
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatPose_pkey" PRIMARY KEY ("catId","pose")
);

-- CreateTable
CREATE TABLE "CatVoiceNote" (
    "catId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mime" TEXT NOT NULL DEFAULT 'audio/wav',
    "text" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatVoiceNote_pkey" PRIMARY KEY ("catId")
);

-- CreateTable
CREATE TABLE "ArrivalPhoto" (
    "catId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mime" TEXT NOT NULL DEFAULT 'image/jpeg',
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArrivalPhoto_pkey" PRIMARY KEY ("catId")
);

-- CreateTable
CREATE TABLE "CatDailySummary" (
    "id" TEXT NOT NULL,
    "catId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "headline" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "interventionResponse" TEXT,
    "tomorrowHook" TEXT,
    "stateChanges" JSONB NOT NULL,
    "threadProgress" JSONB NOT NULL,
    "choices" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatDailySummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginCode" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'VERIFY_EMAIL',
    "userId" TEXT,
    "codeHash" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthAttempt" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationLog" (
    "id" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "reason" TEXT,
    "input" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InviteCode" (
    "code" TEXT NOT NULL,
    "batch" TEXT NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "issuedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InviteCode_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "ContentRating" (
    "id" TEXT NOT NULL,
    "summaryId" TEXT NOT NULL,
    "continuity" INTEGER,
    "persona" INTEGER,
    "fun" INTEGER,
    "emotion" INTEGER,
    "suspense" INTEGER,
    "templated" BOOLEAN,
    "factError" BOOLEAN,
    "shareworthy" BOOLEAN,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArrivalNote" (
    "catId" TEXT NOT NULL,
    "metNpcIds" TEXT[],
    "promisedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "celebratedKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "ArrivalNote_pkey" PRIMARY KEY ("catId")
);

-- CreateTable
CREATE TABLE "NewsTip" (
    "id" TEXT NOT NULL,
    "catId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "publishDay" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsTip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeekBook" (
    "id" TEXT NOT NULL,
    "catId" TEXT NOT NULL,
    "weekIndex" INTEGER NOT NULL DEFAULT 1,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeekBook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_recoveryCode_key" ON "User"("recoveryCode");

-- CreateIndex
CREATE UNIQUE INDEX "Cat_ownerId_key" ON "Cat"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_catId_itemKey_key" ON "Item"("catId", "itemKey");

-- CreateIndex
CREATE UNIQUE INDEX "Relationship_catAId_catBId_key" ON "Relationship"("catAId", "catBId");

-- CreateIndex
CREATE INDEX "Event_day_catId_idx" ON "Event"("day", "catId");

-- CreateIndex
CREATE UNIQUE INDEX "DiaryEntry_catId_day_key" ON "DiaryEntry"("catId", "day");

-- CreateIndex
CREATE INDEX "Channel_userId_idx" ON "Channel"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_kind_externalId_key" ON "Channel"("kind", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_userId_kind_key" ON "Channel"("userId", "kind");

-- CreateIndex
CREATE INDEX "ShortLink_createdAt_idx" ON "ShortLink"("createdAt");

-- CreateIndex
CREATE INDEX "WechatMessageLog_createdAt_idx" ON "WechatMessageLog"("createdAt");

-- CreateIndex
CREATE INDEX "OutboundMessage_status_sendAfter_idx" ON "OutboundMessage"("status", "sendAfter");

-- CreateIndex
CREATE INDEX "OutboundMessage_userId_day_idx" ON "OutboundMessage"("userId", "day");

-- CreateIndex
CREATE INDEX "OutboundMessage_claimId_idx" ON "OutboundMessage"("claimId");

-- CreateIndex
CREATE INDEX "MemoryEntry_catId_day_idx" ON "MemoryEntry"("catId", "day");

-- CreateIndex
CREATE INDEX "IslandNews_day_idx" ON "IslandNews"("day");

-- CreateIndex
CREATE INDEX "OwnerNudge_catId_consumedDay_idx" ON "OwnerNudge"("catId", "consumedDay");

-- CreateIndex
CREATE UNIQUE INDEX "CatDailySummary_catId_day_key" ON "CatDailySummary"("catId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "LoginCode_email_createdAt_idx" ON "LoginCode"("email", "createdAt");

-- CreateIndex
CREATE INDEX "AuthAttempt_kind_key_createdAt_idx" ON "AuthAttempt"("kind", "key", "createdAt");

-- CreateIndex
CREATE INDEX "InviteCode_issuedTo_idx" ON "InviteCode"("issuedTo");

-- CreateIndex
CREATE UNIQUE INDEX "ContentRating_summaryId_key" ON "ContentRating"("summaryId");

-- CreateIndex
CREATE INDEX "NewsTip_publishedAt_idx" ON "NewsTip"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WeekBook_catId_weekIndex_key" ON "WeekBook"("catId", "weekIndex");

-- AddForeignKey
ALTER TABLE "Cat" ADD CONSTRAINT "Cat_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatState" ADD CONSTRAINT "CatState_catId_fkey" FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Storyline" ADD CONSTRAINT "Storyline_catId_fkey" FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_catId_fkey" FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

