import { createCat } from "@/lib/actions";

export const maxDuration = 120; // 领养后 after() 里异步生成立绘

const SLIDERS = [
  { name: "boldness", label: "胆量", low: "谨慎", high: "莽" },
  { name: "sociability", label: "社交", low: "独处", high: "自来熟" },
  { name: "diligence", label: "勤劳", low: "躺平", high: "卷" },
] as const;

export default function AdoptPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">领养一只 AI 猫</h1>
        <p className="mt-1 text-sm text-[#8A7B65]">
          它会住在猫啊岛上，每天自己钓鱼、开店、交朋友——你只需要偶尔回来看看它过得怎么样。
        </p>
      </div>

      <form action={createCat} className="space-y-5 rounded-2xl border border-[#EADFCC] bg-white p-5 shadow-sm">
        <div>
          <label htmlFor="name" className="block text-sm font-medium">名字 *</label>
          <input
            id="name" name="name" required maxLength={12} placeholder="比如：煤球"
            className="mt-1 w-full rounded-lg border border-[#E0D5C0] px-3 py-2 focus:border-[#F5A623] focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="appearance" className="block text-sm font-medium">长什么样</label>
          <input
            id="appearance" name="appearance" maxLength={60} placeholder="比如：圆脸的黑猫，左脚是白色的"
            className="mt-1 w-full rounded-lg border border-[#E0D5C0] px-3 py-2 focus:border-[#F5A623] focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="tags" className="block text-sm font-medium">性格关键词（顿号或逗号分隔，最多 5 个）</label>
          <input
            id="tags" name="tags" maxLength={60} placeholder="比如：傲娇、馋、爱睡觉"
            className="mt-1 w-full rounded-lg border border-[#E0D5C0] px-3 py-2 focus:border-[#F5A623] focus:outline-none"
          />
        </div>

        {SLIDERS.map((s) => (
          <div key={s.name}>
            <label htmlFor={s.name} className="block text-sm font-medium">{s.label}</label>
            <div className="mt-1 flex items-center gap-3 text-xs text-[#A89B85]">
              <span>{s.low}</span>
              <input
                id={s.name} name={s.name} type="range" min={0} max={100} defaultValue={50}
                className="flex-1 accent-[#F5A623]"
              />
              <span>{s.high}</span>
            </div>
          </div>
        ))}

        <div>
          <span className="block text-sm font-medium">希望它过什么样的生活</span>
          <div className="mt-1 grid grid-cols-2 gap-2 text-sm">
            {[
              { v: "chill", label: "🛋️ 舒服躺平" },
              { v: "earn", label: "🐟 攒钱开店" },
              { v: "friends", label: "💕 交遍朋友" },
              { v: "explore", label: "🗺️ 探索全岛" },
            ].map((g, i) => (
              <label key={g.v} className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#E0D5C0] px-3 py-2 has-[:checked]:border-[#F5A623] has-[:checked]:bg-[#FFF9EE]">
                <input type="radio" name="goal" value={g.v} defaultChecked={i === 0} className="accent-[#F5A623]" />
                {g.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="bio" className="block text-sm font-medium">它的故事（会影响日记的语气）</label>
          <textarea
            id="bio" name="bio" maxLength={120} rows={2}
            placeholder="比如：原来是写字楼里的流浪猫，跟着快递船来到了岛上"
            className="mt-1 w-full rounded-lg border border-[#E0D5C0] px-3 py-2 focus:border-[#F5A623] focus:outline-none"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-full bg-[#F5A623] py-2.5 font-medium text-white shadow-sm hover:bg-[#E08E0B]"
        >
          带它上岛 🐾
        </button>
      </form>
    </div>
  );
}
