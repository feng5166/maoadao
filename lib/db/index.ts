import { PrismaClient } from "@prisma/client";

// dev 热重载会反复执行模块，用 globalThis 缓存避免连接数暴涨
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
