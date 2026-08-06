import { redirect } from "next/navigation";

// 旧岛民登记册(表单)已由入岛心流接替(D0 五幕 + D1 相遇剧本,2026-08-05)。
// 旧深链还在外面流传:原样把船票带去 /adopt。
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ ticket?: string }> }) {
  const { ticket } = await searchParams;
  redirect(ticket ? `/adopt?ticket=${encodeURIComponent(ticket)}` : "/adopt");
}
