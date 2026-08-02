import Link from "next/link";
import type { ReactNode } from "react";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 交叉视角链接：文本里出现的猫名变成可点链接——同一件事，去对方的日记里看另一面。
 *  这是"events 是唯一事实来源、所有猫共享事实"架构白送的探索路径。 */
export function LinkedText({
  text,
  cats,
  excludeId,
}: {
  text: string;
  cats: { id: string; name: string }[];
  excludeId?: string;
}) {
  const list = cats
    .filter((c) => c.id !== excludeId && c.name.length >= 2)
    .sort((a, b) => b.name.length - a.name.length);
  if (list.length === 0 || !text) return <>{text}</>;
  const byName = new Map(list.map((c) => [c.name, c.id]));
  const re = new RegExp(list.map((c) => escapeRegExp(c.name)).join("|"), "g");
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    nodes.push(
      <Link
        key={k++}
        href={`/cats/${byName.get(m[0])}`}
        className="underline decoration-line decoration-dotted underline-offset-4 hover:text-brick"
      >
        {m[0]}
      </Link>,
    );
    last = m.index + m[0].length;
  }
  nodes.push(text.slice(last));
  return <>{nodes}</>;
}
