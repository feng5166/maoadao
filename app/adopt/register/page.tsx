import { createCat } from "@/lib/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Track } from "@/components/Track";

export const maxDuration = 120; // 领养后 after() 里异步生成首日内容、立绘与相遇照片

// 岛民登记册（doc/10 §2）：不是"创建角色信息"，是第一次见到它之后帮它登个记。
// 性格参数彻底隐身——三道"你觉得它是什么样"的心理选择题在服务端映射三轴。

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

function Page({ no, title, children }: { no: string; title: string; children: React.ReactNode }) {
  return (
    <section className="note-slip p-5" style={{ transform: `rotate(${no === "二" || no === "四" ? "-0.4" : "0.4"}deg)` }}>
      <p className="text-xs tracking-widest text-ink-faint">第{no}页</p>
      <h2 className="font-title mt-1 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  return (
    <div className="mx-auto max-w-lg">
      <Track events={[{ name: "adopt_start" }]} />

      <div className="text-center">
        <p className="seal">岛民登记册</p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          它就蹲在登记台边上打量你。棉花帮你翻开岛民册：
          <br />
          「就几个问题——答完，它就是你的猫啦。」
        </p>
      </div>

      {/* 预期错误（无效船票/审核不过）：世界观口径的错误条，不再是整页服务器错误 */}
      {err && (
        <div className="mt-5 border-l-2 border-brick bg-paper-deep/40 p-3 text-sm leading-relaxed text-ink">
          棉花有点抱歉地看着你：「{err}」
        </div>
      )}

      <form action={createCat} className="mt-8 space-y-6">
        <div>
          <label htmlFor="ticket" className="font-title block text-sm font-bold">你的船票号 <span className="text-brick">*</span></label>
          <input
            id="ticket" name="ticket" required maxLength={19} placeholder="BOAT-XXXX-XXXX-XXXX"
            className="mt-1.5 w-full border-0 border-b border-line bg-transparent px-1 py-2 uppercase focus:border-sea-deep focus:outline-none"
          />
        </div>

        <Page no="一" title="它叫什么？">
          <input
            id="name" name="name" required maxLength={12} placeholder="煤球" aria-label="它的名字"
            className="mt-3 w-full border-0 border-b border-line bg-transparent px-1 py-2 focus:border-sea-deep focus:outline-none"
          />
          {/* 外貌去参数化(doc/12 §三.7):不是 prompt 描述框,是"认识一只猫"的问题 */}
          <p className="mt-4 text-sm text-ink-soft">你第一眼注意到它哪里？</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            {[
              { v: "tail", label: "毛茸茸的大尾巴" },
              { v: "eyes", label: "圆圆的眼睛" },
              { v: "ears", label: "小小的耳朵" },
              { v: "messy", label: "总是乱糟糟的毛" },
            ].map((o, i) => (
              <label
                key={o.v}
                className="flex cursor-pointer items-center gap-2 border border-line px-3 py-2 has-[:checked]:border-sea-deep has-[:checked]:bg-paper-deep"
              >
                <input type="radio" name="firstSight" value={o.v} defaultChecked={i === 0} className="accent-[#5c7382]" />
                {o.label}
              </label>
            ))}
          </div>
          <details className="mt-2 text-xs text-ink-faint">
            <summary className="cursor-pointer">如果你愿意，也可以告诉我们更多</summary>
            <input
              id="appearance" name="appearance" maxLength={60} placeholder="圆脸的黑猫，左脚是白色的"
              className="mt-2 w-full border-0 border-b border-line bg-transparent px-1 py-2 text-sm focus:border-sea-deep focus:outline-none"
            />
          </details>
          <details className="mt-3 text-xs text-ink-faint">
            <summary className="cursor-pointer">它是怎么来到岛上的？（可以不填）</summary>
            <textarea
              id="bio" name="bio" maxLength={120} rows={2}
              placeholder="原来是写字楼里的流浪猫，跟着快递船来的"
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
                      <input type="radio" name={q.name} value={o.v} defaultChecked={i === 2} className="accent-[#5c7382]" />
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
                className="mt-1.5 w-full border-0 border-b border-line bg-transparent px-1 py-2 text-sm focus:border-sea-deep focus:outline-none"
              />
            </div>
            <div>
              <p className="text-sm text-ink">你猜它想在岛上过什么日子？</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                {[
                  { v: "chill", label: "晒着太阳打盹" },
                  { v: "earn", label: "攒鱼币开小店" },
                  { v: "friends", label: "认识所有邻居" },
                  { v: "explore", label: "把岛走个遍" },
                ].map((g, i) => (
                  <label
                    key={g.v}
                    className="flex cursor-pointer items-center gap-2 border border-line px-3 py-2 has-[:checked]:border-sea-deep has-[:checked]:bg-paper-deep"
                  >
                    <input type="radio" name="goal" value={g.v} defaultChecked={i === 0} className="accent-[#5c7382]" />
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
            className="mt-3 w-full border-0 border-b border-line bg-transparent px-1 py-2 focus:border-sea-deep focus:outline-none"
          />
          <p className="mt-2 text-xs text-ink-faint">它会一直这么叫你。</p>
        </Page>

        <Page no="四" title="第一次见面，你想对它说什么？">
          <textarea
            id="firstWords" name="firstWords" maxLength={60} rows={2}
            placeholder="不要害怕，我会来看你的。"
            className="mt-3 w-full border border-line bg-transparent px-3 py-2 text-sm focus:border-sea-deep focus:outline-none"
          />
          <p className="mt-2 text-xs text-ink-faint">这句话它会记一辈子。</p>
        </Page>

        <div className="pt-2 text-center">
          <SubmitButton pendingText="它竖起了耳朵，朝你走过来……" className="stamp-btn w-full">
            就是它了 🐾
          </SubmitButton>
          <p className="mt-2 text-xs text-ink-faint">登记完成后，它今天就住进小屋，晚上写下来岛第一天的日记。</p>
        </div>
      </form>
    </div>
  );
}
