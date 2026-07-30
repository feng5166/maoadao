import { describe, expect, it } from "vitest";
import { assertOwnerCheck } from "../lib/actions";

// 所有权守卫：页面显隐不能代替服务端授权——这里测的是服务端那道门

describe("留言所有权校验", () => {
  const myCat = { isNpc: false, ownerId: "u-alice" };

  it("主人本人可以留言", async () => {
    await expect(assertOwnerCheck(myCat, "u-alice")).resolves.toBeUndefined();
  });

  it("其他访客（知道猫 ID）被拒绝", async () => {
    await expect(assertOwnerCheck(myCat, "u-mallory")).rejects.toThrow("这不是你的猫");
  });

  it("匿名访客（无 cookie）被拒绝", async () => {
    await expect(assertOwnerCheck(myCat, null)).rejects.toThrow("这不是你的猫");
  });

  it("无主猫（历史数据）任何人都不能留言", async () => {
    await expect(assertOwnerCheck({ isNpc: false, ownerId: null }, "u-alice")).rejects.toThrow("这不是你的猫");
  });

  it("NPC 猫不能被留言", async () => {
    await expect(assertOwnerCheck({ isNpc: true, ownerId: null }, "u-alice")).rejects.toThrow("只能给自己领养的猫留言");
  });

  it("猫不存在时拒绝", async () => {
    await expect(assertOwnerCheck(null, "u-alice")).rejects.toThrow("只能给自己领养的猫留言");
  });
});
