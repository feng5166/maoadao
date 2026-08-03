import Link from "next/link";
import Image from "next/image";
import { CatAvatar } from "./CatAvatar";
import { LinkedText } from "./LinkedText";
import { IconPaw } from "./icons";

// 居民主页组件族(小屋版):不是资料页,是走进一位岛民的家。
// 情绪密度来自:生活照上的胶带、手写体的日期、关系里的具体经历、翻得动的生活册。
// 全部生活语言,数字不在这里出现。

// 每只猫一点轻微的主题色:只用在胶带/小装饰,不换皮肤
const ACCENT_TAPES = [
  "rgba(138, 155, 124, 0.32)", // 鼠尾草
  "rgba(126, 147, 163, 0.30)", // 灰蓝
  "rgba(217, 164, 65, 0.26)", // 暖黄
  "rgba(181, 84, 59, 0.18)", // 砖红(最淡)
];
export function accentTape(catId: string): string {
  let h = 0;
  for (const ch of catId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ACCENT_TAPES[h % ACCENT_TAPES.length];
}

/** 首屏生活照:猫 + 环境 + 一个生活动作;照片底下是手写的日期和一句闲话 */
export function CatHeroScene({
  name,
  catId,
  lifePhoto,
  arrivalPhoto,
  portraitUrl,
  captionMeta,
  flavorLine,
}: {
  name: string;
  catId: string;
  lifePhoto: string | null;
  arrivalPhoto: string | null;
  portraitUrl?: string | null;
  captionMeta: string;
  flavorLine: string | null;
}) {
  const photo = lifePhoto ? (
    <Image src={lifePhoto} alt={`${name}在岛上生活的样子`} width={1200} height={900} priority className="w-full" />
  ) : arrivalPhoto ? (
    // eslint-disable-next-line @next/next/no-img-element -- 相遇照片走自有 API,长缓存
    <img src={`${arrivalPhoto}${arrivalPhoto.includes("?") ? "&" : "?"}s=720`} alt={`${name}来岛第一天`} className="w-full" />
  ) : null;

  return (
    <div>
      <div className="relative">
        {/* 一截胶带把照片贴在纸上(每只猫的胶带颜色不太一样) */}
        <div
          className="absolute -top-2 left-1/2 z-10 h-[18px] w-[86px] -translate-x-1/2 rotate-[-2deg]"
          style={{ background: accentTape(catId) }}
        />
        {photo ? (
          <div className="overflow-hidden rounded-sm border border-line bg-[#fffdf6] p-1.5 pb-1">
            {photo}
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-sm border border-line bg-paper-deep/40 py-10">
            <CatAvatar id={catId} size={160} portraitUrl={portraitUrl} />
          </div>
        )}
      </div>
      <p className="font-diary mt-2 text-center text-[13px] text-ink-soft">{captionMeta}</p>
      {flavorLine && <p className="font-diary mt-0.5 text-center text-[13px] text-ink-faint">{flavorLine}</p>}
    </div>
  );
}

/** 此刻:推开窗第一眼——现在几时、它在哪、在干嘛、门口有什么生活痕迹 */
export function CatCurrentMoment({
  dateLine,
  nowText,
  mood,
  traceLine,
}: {
  dateLine: string;
  nowText: string;
  mood: string | null | undefined;
  traceLine: string | null;
}) {
  return (
    <div className="mt-3">
      <p className="text-xs tracking-widest text-ink-soft">{dateLine}</p>
      <p className="font-diary mt-2 text-[16px] leading-relaxed text-ink">{nowText}</p>
      <p className="mt-1 text-xs text-ink-soft">看起来{mood ? `心情${mood}` : "心情不错"}。</p>
      {traceLine && <p className="font-diary mt-1.5 text-[13px] leading-relaxed text-ink-faint">{traceLine}</p>}
    </div>
  );
}

export type SharedStory = { day: number; text: string } | null;

/** 小屋里的东西:生活痕迹,不是背包——看见这些才觉得"这是它的家" */
export function CatHutItems({ items, tape }: { items: string[]; tape: string }) {
  if (items.length === 0) return null;
  return (
    <div className="note-slip relative mt-6 p-4" style={{ transform: "rotate(0.3deg)" }}>
      <div className="absolute -top-2 left-10 h-[16px] w-[56px] rotate-[-2deg]" style={{ background: tape }} />
      <p className="text-xs tracking-widest text-ink-faint">它的小屋里</p>
      <ul className="font-diary mt-1.5 space-y-1 text-[14px] leading-relaxed text-ink">
        {items.map((it) => (
          <li key={it}>· {it}</li>
        ))}
      </ul>
    </div>
  );
}

/** 关系故事卡:关系不是状态,是经历——第一次见面、最近一次、现在 */
export function RelationshipStoryCard({
  catName,
  myCatName,
  affinityText,
  firstStory,
  latestStory,
  tape,
}: {
  catName: string;
  myCatName: string;
  affinityText: string;
  firstStory: SharedStory;
  latestStory: SharedStory;
  tape: string;
}) {
  return (
    <div className="note-slip relative mt-6 p-4" style={{ transform: "rotate(0.4deg)" }}>
      <div className="absolute -top-2 right-8 h-[16px] w-[64px] rotate-[3deg]" style={{ background: tape }} />
      <p className="text-xs tracking-widest text-ink-faint">{catName}和{myCatName}</p>
      <div className="font-diary mt-1.5 space-y-1 text-[15px] leading-relaxed text-ink">
        {firstStory && (
          <p>
            第一次见面是猫啊岛第 {firstStory.day} 天——那天{firstStory.text}
          </p>
        )}
        {latestStory && latestStory.day !== firstStory?.day && (
          <p>最近一次:{latestStory.text}(第 {latestStory.day} 天)</p>
        )}
        <p>现在,它们是{affinityText}。</p>
      </div>
    </div>
  );
}

export type FriendCard = {
  relId: string;
  otherId: string;
  otherName: string;
  otherPortraitUrl: string | null;
  affinityText: string;
  latestStory: SharedStory;
};

/** 它认识的朋友:每张卡带"为什么认识"的一句故事 */
export function CatRelationship({ friends }: { friends: FriendCard[] }) {
  if (friends.length === 0) return null;
  return (
    <div className="mt-6 border-t border-line pt-4">
      <p className="text-xs tracking-widest text-ink-faint">它认识的朋友</p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {friends.map((f) => (
          <Link
            key={f.relId}
            href={`/cats/${f.otherId}`}
            className="flex items-start gap-3 border border-line bg-paper-deep/20 p-3 transition-colors hover:border-sea-deep"
          >
            <CatAvatar id={f.otherId} size={40} portraitUrl={f.otherPortraitUrl} crop="head" />
            <span className="min-w-0">
              <span className="flex items-baseline gap-2">
                <span className="font-title text-sm font-bold text-ink">{f.otherName}</span>
                <span className="text-[11px] text-sage">{f.affinityText}</span>
              </span>
              <span className="font-diary mt-0.5 block text-[13px] leading-snug text-ink-soft">
                {f.latestStory
                  ? `第 ${f.latestStory.day} 天,${f.latestStory.text}`
                  : "还没一起经历过什么,不过快了。"}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export type LifePage = {
  id: string;
  day: number;
  mood: string;
  content: string;
  sceneImg: string | null;
  /** 观察窗口的三要素:时段 · 地点 · 状态(缺哪项就省哪项) */
  metaLine: string | null;
  /** 这个瞬间留下了什么(小物件,按地点派生) */
  leftBehind: string | null;
};

/** 生活册:每一天是一张照片卡——日期手写、照片贴上、一句话,想读全文再翻开 */
export function CatLifeBook({
  name,
  catId,
  pages,
  catIndex,
}: {
  name: string;
  catId: string;
  pages: LifePage[];
  catIndex: { id: string; name: string }[];
}) {
  return (
    <section id="lifebook" className="mt-8 border-t-4 border-double border-line pt-5">
      <h2 className="font-title mb-3 flex items-center gap-1.5 font-bold">
        <IconPaw size={15} className="text-ink-faint" />
        {name}的生活册
      </h2>
      {pages.length === 0 && (
        <p className="py-8 text-center text-sm text-ink-faint">第一页还空着——等岛上的下一天开始吧。</p>
      )}
      <div className="space-y-5">
        {pages.map((d, i) => {
          const short = d.content.length <= 110;
          return (
            <article key={d.id} className="note-slip p-4" style={{ transform: `rotate(${i % 2 === 0 ? "-0.3" : "0.3"}deg)` }}>
              <div className="flex items-baseline justify-between">
                <p className="font-diary text-[13px] text-ink-soft">猫啊岛 第 {d.day} 天</p>
                <Link href={`/share/${catId}/${d.day}`} className="text-xs text-ink-faint hover:text-brick">
                  分享卡
                </Link>
              </div>
              {d.metaLine && <p className="text-[11px] text-ink-faint">{d.metaLine}</p>}
              {d.sceneImg && (
                <div className="mt-2 overflow-hidden rounded-sm border border-line">
                  <Image src={d.sceneImg} alt="" width={1200} height={686} loading="lazy" className="w-full" />
                </div>
              )}
              {short ? (
                <p className="font-diary mt-2 whitespace-pre-wrap text-[15px] leading-[1.9]">
                  <LinkedText text={d.content} cats={catIndex} excludeId={catId} />
                </p>
              ) : (
                <details className="mt-2">
                  <summary className="font-diary cursor-pointer list-none text-[15px] leading-[1.9] text-ink">
                    {d.content.slice(0, 100)}……<span className="text-xs text-ink-faint">(翻开这一页)</span>
                  </summary>
                  <p className="font-diary mt-2 whitespace-pre-wrap text-[15px] leading-[1.9]">
                    <LinkedText text={d.content} cats={catIndex} excludeId={catId} />
                  </p>
                </details>
              )}
              {d.leftBehind && (
                <p className="mt-2.5 text-[11px] text-ink-faint">
                  <span className="mr-1.5 inline-block -rotate-2 border border-line px-1.5 py-0.5">留下</span>
                  {d.leftBehind}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** 它留下的东西:主人的第一句话、重要的事、收藏物、一个小秘密 */
export function CatMemoryBox({
  firstWordsLine,
  keepsakes,
  secret,
  tape,
}: {
  firstWordsLine: string | null;
  keepsakes: { id: string; content: string; day: number }[];
  secret: string | null;
  tape: string;
}) {
  if (!firstWordsLine && keepsakes.length === 0 && !secret) return null;
  return (
    <div className="note-slip relative mt-6 p-4" style={{ transform: "rotate(-0.4deg)" }}>
      <div className="absolute -top-2 left-8 h-[16px] w-[64px] rotate-[-3deg]" style={{ background: tape }} />
      <p className="font-title text-sm font-bold">它留下的东西</p>
      <ul className="mt-2 space-y-2">
        {firstWordsLine && (
          <li className="font-diary text-[15px] leading-relaxed text-ink">{firstWordsLine}</li>
        )}
        {keepsakes.map((k) => (
          <li key={k.id} className="font-diary text-[15px] leading-relaxed text-ink">
            {k.content}
            <span className="ml-2 text-xs text-ink-faint">第 {k.day} 天</span>
          </li>
        ))}
      </ul>
      {secret && (
        <div className="mt-3 border-t border-line pt-2.5">
          <p className="text-xs tracking-widest text-ink-faint">有些事情,它还没告诉别人</p>
          <p className="font-diary mt-1 text-[15px] leading-relaxed text-ink">{secret}</p>
        </div>
      )}
    </div>
  );
}
