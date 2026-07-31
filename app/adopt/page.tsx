import { createCat } from "@/lib/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Track } from "@/components/Track";

export const maxDuration = 120; // 领养后 after() 里异步生成立绘

// 入岛登记册：像码头工作人员帮你填档案，不是创建 AI 角色参数（v0.7）

const TEMPERAMENTS = [
  { name: "boldness", low: "见到响声就躲", high: "总想先去看看" },
  { name: "sociability", low: "更喜欢独处", high: "走到哪都能聊起来" },
  { name: "diligence", low: "能躺着绝不动", high: "闲不下来" },
] as const;

export default function AdoptPage() {
  return (
    <div className="mx-auto max-w-lg">
      <Track events={[{ name: "adopt_start" }]} />

      <div className="text-center">
        <p className="seal">入岛登记</p>
        <h1 className="font-title mt-2 text-2xl font-bold">码头登记处</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          船快到了。趁它还没下船，帮它把入岛档案填了吧——
          <br />
          写下它是只什么样的猫，岛上就会认识它。
        </p>
      </div>

      <form action={createCat} className="mt-8 space-y-7">
        <div>
          <label htmlFor="ticket" className="font-title block font-bold">你的船票号 <span className="text-brick">*</span></label>
          <input
            id="ticket" name="ticket" required maxLength={19} placeholder="BOAT-XXXX-XXXX-XXXX（找给你介绍猫啊岛的人要一张）"
            className="mt-2 w-full border-0 border-b border-line bg-transparent px-1 py-2 uppercase focus:border-sea-deep focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="name" className="font-title block font-bold">它叫什么 <span className="text-brick">*</span></label>
          <input
            id="name" name="name" required maxLength={12} placeholder="煤球"
            className="mt-2 w-full border-0 border-b border-line bg-transparent px-1 py-2 focus:border-sea-deep focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="appearance" className="font-title block font-bold">它长什么样</label>
          <input
            id="appearance" name="appearance" maxLength={60} placeholder="圆脸的黑猫，左脚是白色的"
            className="mt-2 w-full border-0 border-b border-line bg-transparent px-1 py-2 focus:border-sea-deep focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="tags" className="font-title block font-bold">用几个词形容它</label>
          <input
            id="tags" name="tags" maxLength={60} placeholder="傲娇、馋、爱睡觉（顿号分开，最多 5 个）"
            className="mt-2 w-full border-0 border-b border-line bg-transparent px-1 py-2 focus:border-sea-deep focus:outline-none"
          />
        </div>

        <div className="space-y-5">
          <p className="font-title font-bold">它是只什么脾气的猫</p>
          {TEMPERAMENTS.map((t) => (
            <div key={t.name} className="flex items-center gap-3 text-xs text-ink-soft">
              <span className="w-24 text-right leading-tight">{t.low}</span>
              <input
                name={t.name} type="range" min={0} max={100} defaultValue={50}
                className="semantic-range flex-1"
                aria-label={`${t.low} 到 ${t.high}`}
              />
              <span className="w-24 leading-tight">{t.high}</span>
            </div>
          ))}
        </div>

        <div>
          <label htmlFor="ownerNick" className="font-title block font-bold">让它怎么称呼你</label>
          <input
            id="ownerNick" name="ownerNick" maxLength={8} placeholder="铲屎官、老大、麻麻"
            className="mt-2 w-full border-0 border-b border-line bg-transparent px-1 py-2 focus:border-sea-deep focus:outline-none"
          />
        </div>

        <div>
          <p className="font-title font-bold">它想在岛上过什么日子</p>
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

        <div>
          <label htmlFor="bio" className="font-title block font-bold">它是怎么来到岛上的（可以不填）</label>
          <textarea
            id="bio" name="bio" maxLength={120} rows={2}
            placeholder="原来是写字楼里的流浪猫，跟着快递船来的"
            className="mt-2 w-full border border-line bg-transparent px-3 py-2 text-sm focus:border-sea-deep focus:outline-none"
          />
        </div>

        <div className="pt-2 text-center">
          <SubmitButton pendingText="码头正在办手续…（约几秒）" className="stamp-btn w-full">
            办理入岛 🐾
          </SubmitButton>
          <p className="mt-2 text-xs text-ink-faint">登记完成后，它今天就会住进小屋，晚上给你写第一篇日记。</p>
        </div>
      </form>
    </div>
  );
}
