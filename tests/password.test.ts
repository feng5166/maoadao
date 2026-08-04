import { describe, expect, it } from "vitest";
import { hashPassword, passwordPolicyError, verifyPassword } from "../lib/password";

describe("密码哈希(scrypt)与策略", () => {
  it("哈希-校验往返;错误密码拒绝;盐随机化", () => {
    const h1 = hashPassword("一句只有我知道的话 with spaces");
    const h2 = hashPassword("一句只有我知道的话 with spaces");
    expect(h1).not.toBe(h2); // 随机盐
    expect(h1.startsWith("scrypt$15$8$1$")).toBe(true);
    expect(verifyPassword("一句只有我知道的话 with spaces", h1)).toBe(true);
    expect(verifyPassword("一句只有我知道的话 with spaces", h2)).toBe(true);
    expect(verifyPassword("不对的密码", h1)).toBe(false);
    expect(verifyPassword("", h1)).toBe(false);
    expect(verifyPassword("whatever", "garbage")).toBe(false);
  });

  it("策略:只限长度与常见密码,允许中文/空格/Unicode,不搞组合规则", () => {
    expect(passwordPolicyError("short")).toBeTruthy(); // <8
    expect(passwordPolicyError("password")).toBeTruthy(); // 常见
    expect(passwordPolicyError("12345678")).toBeTruthy(); // 常见
    expect(passwordPolicyError("猫在岛上等我回家")).toBeNull(); // 8 个中文字符 ✓
    expect(passwordPolicyError("correct horse battery")).toBeNull(); // 空格 ✓
    expect(passwordPolicyError("a".repeat(201))).toBeTruthy(); // 超长
  });
});
