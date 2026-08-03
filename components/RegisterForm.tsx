"use client";

import { useActionState, useEffect, useRef } from "react";
import { createCat } from "@/lib/actions";
import { SubmitButton } from "./SubmitButton";
import { IconPaw } from "./icons";

// 岛民登记册表单（客户端）：出错不刷新页面——错误条就地出现并滚到眼前，
// 填好的登记册原样保留（服务端把值回显，key 换代强制以回填值重挂）。

const IMPRESSIONS = [
  {
    name: "impBold",
    question: "它到了陌生的地方，会——",
    options: [
      { v: "dash", label: "马上跑过去看看" },
      { v: "watch", label: "先躲起来观察" },
      { v: "slow", label: "慢慢地、一步一步凑近" },
    ],
  },
  {
    name: "impSocial",
    question: "遇到不认识的猫，它大概会——",
    options: [
      { v: "greet", label: "主动凑上去搭话" },
      { v: "wait", label: "等对方先开口" },
      { v: "alone", label: "假装没看见，自己走自己的" },
    ],
  },
  {
    name: "impDiligent",
    question: "太阳很好的下午，它多半在——",
    options: [
      { v: "busy", label: "忙自己的事，闲不下来" },
      { v: "nap", label: "找个最舒服的地方睡觉" },
      { v: "mood", label: "看心情，谁也说不准" },
    ],
  },
] as const;

const FIRST_SIGHTS = [
  { v: "tail", label: "毛茸茸的大尾巴" },
  { v: "eyes", label: "圆圆的眼睛" },
  { v: "ears", label: "小小的耳朵" },
  { v: "messy", label: "总是乱糟糟的毛" },
];

const GOALS = [
  { v: "chill", label: "晒着太阳打盹" },
  { v: "earn", label: "攒鱼币开小店" },
  { v: "friends", label: "认识所有邻居" },
  { v: "explore", label: "把岛走个遍" },
];

function Page({ no, title, children }: { no: string; title: string; children: React.ReactNode }) {
  return (
    <section className="note-slip p-5" style={{ transform: `rotate(${no === "二" || no === "四" ? "-0.4" : "0.4"}deg)` }}>
      <p className="text-xs tracking-widest text-ink-faint">第{no}页</p>
      <h2 className="font-title mt-1 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

export function RegisterForm() {
  const [state, formAction] = useActionState(createCat, null);
  const errRef = useRef<HTMLDivElement>(null);

  // 每次出错都把岛主那句话滚到眼前——错误不能藏在视野外
  useEffect(() => {
    if (state?.err) errRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [state?.n, state?.err]);

  const v = state?.v ?? {};
  const ticketErr = Boolean(state?.err && state.err.includes("船票"));

  return (
    <form action={formAction} className="mt-8">
      {/* key 换代：出错重挂一次，让 defaultValue 吃到回显值 */}
      <div key={state?.n ?? 0} className="space-y-6">
        {state?.err && (
          <div ref={errRef} className="note-slip -rotate-[0.4deg] border-l-4 border-l-brick p-4 text-sm leading-relaxed">
            <p className="font-title font-bold text-brick">岛主放下笔，有点抱歉地看着你：</p>
            <p className="font-diary mt-1.5 text-[15px] text-ink">「{state.err}」</p>
            <p className="mt-1.5 text-xs text-ink-soft">你填好的登记册还摊在桌上——改一改，接着办就行。</p>
          </div>
        )}

        <div>
          <label htmlFor="ticket" className="font-title block text-sm font-bold">
            你的船票号 <span className="text-brick">*</span>
          </label>
          <input
            id="ticket" name="ticket" required maxLength={19} placeholder="BOAT-XXXX-XXXX-XXXX"
            defaultValue={v.ticket}
            aria-invalid={ticketErr}
            className={`mt-1.5 w-full border-0 border-b bg-transparent px-1 py-2 uppercase focus:outline-none ${
              ticketErr ? "border-brick text-brick focus:border-brick" : "border-line focus:border-sea-deep"
            }`}
          />
          {ticketErr && <p className="mt-1 text-xs text-brick">↑ 换一张有效的船票号，其他都不用重填</p>}
        </div>

        <Page no="一" title="它叫什么？">
          <input
            id="name" name="name" required maxLength={12} placeholder="煤球" aria-label="它的名字"
            defaultValue={v.name}
            className="mt-3 w-full border-0 border-b border-line bg-transparent px-1 py-2 focus:border-sea-deep focus:outline-none"
          />
          {/* 外貌去参数化(doc/12 §三.7):不是 prompt 描述框,是"认识一只猫"的问题 */}
          <p className="mt-4 text-sm text-ink-soft">你第一眼注意到它哪里？</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            {FIRST_SIGHTS.map((o, i) => (
              <label
                key={o.v}
                className="flex cursor-pointer items-center gap-2 border border-line px-3 py-2 has-[:checked]:border-sea-deep has-[:checked]:bg-paper-deep"
              >
                <input
                  type="radio" name="firstSight" value={o.v}
                  defaultChecked={v.firstSight ? v.firstSight === o.v : i === 0}
                  className="accent-[#5c7382]"
                />
                {o.label}
              </label>
            ))}
          </div>
          <details className="mt-2 text-xs text-ink-faint" open={Boolean(v.appearance)}>
            <summary className="cursor-pointer">如果你愿意，也可以告诉我们更多</summary>
            <input
              id="appearance" name="appearance" maxLength={60} placeholder="圆脸的黑猫，左脚是白色的"
              defaultValue={v.appearance}
              className="mt-2 w-full border-0 border-b border-line bg-transparent px-1 py-2 text-sm focus:border-sea-deep focus:outline-none"
            />
          </details>
          <details className="mt-3 text-xs text-ink-faint" open={Boolean(v.bio)}>
            <summary className="cursor-pointer">它是怎么来到岛上的？（可以不填）</summary>
            <textarea
              id="bio" name="bio" maxLength={120} rows={2}
              placeholder="原来是写字楼里的流浪猫，跟着快递船来的"
              defaultValue={v.bio}
              className="mt-2 w-full border border-line bg-transparent px-3 py-2 text-sm text-ink focus:border-sea-deep focus:outline-none"
            />
          </details>
        </Page>

        <Page no="二" title="第一次见到它，你觉得它是什么样？">
          <div className="mt-3 space-y-5">
            {IMPRESSIONS.map((q) => (
              <div key={q.name}>
                <p className="text-sm text-ink">{q.question}</p>
                <div className="mt-2 space-y-1.5">
                  {q.options.map((o, i) => (
                    <label
                      key={o.v}
                      className="flex cursor-pointer items-center gap-2 border border-line px-3 py-1.5 text-sm has-[:checked]:border-sea-deep has-[:checked]:bg-paper-deep"
                    >
                      <input
                        type="radio" name={q.name} value={o.v}
                        defaultChecked={v[q.name] ? v[q.name] === o.v : i === 2}
                        className="accent-[#5c7382]"
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div>
              <label htmlFor="tags" className="text-sm text-ink">再用几个词形容它——</label>
              <input
                id="tags" name="tags" maxLength={60} placeholder="傲娇、馋、爱睡觉（顿号分开，最多 5 个）"
                defaultValue={v.tags}
                className="mt-1.5 w-full border-0 border-b border-line bg-transparent px-1 py-2 text-sm focus:border-sea-deep focus:outline-none"
              />
            </div>
            <div>
              <p className="text-sm text-ink">你猜它想在岛上过什么日子？</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                {GOALS.map((g, i) => (
                  <label
                    key={g.v}
                    className="flex cursor-pointer items-center gap-2 border border-line px-3 py-2 has-[:checked]:border-sea-deep has-[:checked]:bg-paper-deep"
                  >
                    <input
                      type="radio" name="goal" value={g.v}
                      defaultChecked={v.goal ? v.goal === g.v : i === 0}
                      className="accent-[#5c7382]"
                    />
                    {g.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Page>

        <Page no="三" title="如果它以后想找你，它该怎么叫你？">
          <input
            id="ownerNick" name="ownerNick" maxLength={8} placeholder="铲屎官、老大、麻麻" aria-label="它对你的称呼"
            defaultValue={v.ownerNick}
            className="mt-3 w-full border-0 border-b border-line bg-transparent px-1 py-2 focus:border-sea-deep focus:outline-none"
          />
          <p className="mt-2 text-xs text-ink-faint">它会一直这么叫你。</p>
        </Page>

        <Page no="四" title="第一次见面，你想对它说什么？">
          <textarea
            id="firstWords" name="firstWords" maxLength={60} rows={2}
            placeholder="不要害怕，我会来看你的。"
            defaultValue={v.firstWords}
            className="mt-3 w-full border border-line bg-transparent px-3 py-2 text-sm focus:border-sea-deep focus:outline-none"
          />
          <p className="mt-2 text-xs text-ink-faint">这句话它会记一辈子。</p>
        </Page>

        <div className="pt-2 text-center">
          <SubmitButton pendingText="它竖起了耳朵，朝你走过来……" className="stamp-btn w-full">
            就是它了 <IconPaw size={15} />
          </SubmitButton>
          <p className="mt-2 text-xs text-ink-faint">登记完成后，它今天就住进小屋，晚上写下来岛第一天的日记。</p>
        </div>
      </div>
    </form>
  );
}
