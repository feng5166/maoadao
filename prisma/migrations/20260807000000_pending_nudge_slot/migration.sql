-- 未消费留言的唯一槽位(2026-08-07 review P2)
--
-- 「每天只认最新一条」原先靠 deleteMany → create 两步实现,并发下两个请求可能
-- 都删完再各插一条,留下两条待消费记录 —— 模拟器当天会读到不确定的那一条。
-- 部分唯一索引把这条规则交给数据库:同一只猫在"未消费"状态下最多一条。
-- (Prisma schema 表达不了带 WHERE 的部分索引,所以走 migration。)
--
-- 落之前先合并历史脏数据:同一只猫的多条未消费留言只留最新的一条。
DELETE FROM "OwnerNudge" a
USING "OwnerNudge" b
WHERE a."consumedDay" IS NULL
  AND b."consumedDay" IS NULL
  AND a."catId" = b."catId"
  AND (a."createdAt" < b."createdAt" OR (a."createdAt" = b."createdAt" AND a."id" < b."id"));

CREATE UNIQUE INDEX IF NOT EXISTS "OwnerNudge_catId_pending_key"
  ON "OwnerNudge" ("catId")
  WHERE "consumedDay" IS NULL;
