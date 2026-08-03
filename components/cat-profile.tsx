import Link from "next/link";
import Image from "next/image";
import { CatAvatar } from "./CatAvatar";
import { LinkedText } from "./LinkedText";

// 居民主页组件族(CatProfilePage 2.0):同一套骨架,按访问关系(我的猫/熟猫/陌生猫)组装。
// 全部展示"生活语言",数字不在这里出现。

/** 首屏生活照:有环境、有动作、有故事——不是证件照 */
export function CatHeroScene({
  name,
  lifePhoto,
  arrivalPhoto,
  catId,
  portraitUrl,
}: {
  name: string;
  lifePhoto: string | null;
  arrivalPhoto: string | null;
  catId: string;
  portraitUrl?: string | null;
}) {
  if (lifePhoto) {
    return (
      <div className="overflow-hidden rounded-lg border border-line">
        <Image src={lifePhoto} alt={`${name}在岛上生活的样子`} width={1200} height={900} priority className="w-full" />
      </div>
    );
  }
  if (arrivalPhoto) {
    return (
      <div className="overflow-hidden rounded-lg border border-line">
        {/* eslint-disable-next-line @next/next/no-img-element -- 相遇照片走自有 API,长缓存 */}
        <img src={`${arrivalPhoto}${arrivalPhoto.includes("?") ? "&" : "?"}s=720`} alt={`${name}来岛第一天`} className="w-full" />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center rounded-lg border border-line bg-paper-deep/40 py-10">
      <CatAvatar id={catId} size={160} portraitUrl={portraitUrl} />
    </div>
  );
}

/** 此刻:第一眼要知道"它现在在哪里、在干嘛" */
export function CatCurrentMoment({ nowText, mood }: { nowText: string; mood: string | null | undefined }) {
  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="font-diary text-[15px] leading-relaxed text-ink">{nowText}</p>
      <p className="mt-1 text-xs text-ink-soft">看起来{mood ? `心情${mood}` : "心情不错"}。</p>
    </div>
  );
}

/** 它和你的猫:熟猫主页的关系入口——为什么认识、最近一起经历了什么 */
export function CatBond({
  myCatName,
  affinityText,
  firstMetDay,
  latestStory,
}: {
  myCatName: string;
  affinityText: string;
  firstMetDay: number | null;
  latestStory: { day: number; text: string } | null;
}) {
  return (
    <div className="note-slip mt-6 p-4" style={{ transform: "rotate(0.4deg)" }}>
      <p className="text-xs tracking-widest text-ink-faint">它和{myCatName}</p>
      <p className="font-diary mt-1.5 text-[15px] leading-relaxed text-ink">
        {firstMetDay ? `第 ${firstMetDay} 天第一次打交道,` : ""}现在是{affinityText}。
        {latestStory && (
          <>
            <br />
            最近一次:{latestStory.text}(第 {latestStory.day} 天)
          </>
        )}
      </p>
    </div>
  );
}

export type FriendCard = {
  relId: string;
  otherId: string;
  otherName: string;
  otherPortraitUrl: string | null;
  affinityText: string;
  story: { day: number; text: string } | null;
};

/** 它认识的朋友:关系故事,不是好友列表 */
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
                {f.story ? `第 ${f.story.day} 天:${f.story.text}` : "还没一起经历过什么,不过快了。"}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export type LifePage = { id: string; day: number; mood: string; content: string };

/** 生活册:它最近留下的几页——每一天是过去真实发生的事 */
export function CatLifeBook({
  name,
  catId,
  pages,
  catIndex,
  firstOpen = true,
}: {
  name: string;
  catId: string;
  pages: LifePage[];
  catIndex: { id: string; name: string }[];
  firstOpen?: boolean;
}) {
  return (
    <section id="lifebook" className="mt-8 border-t-4 border-double border-line pt-5">
      <h2 className="font-title mb-3 font-bold">{name}最近留下的几页</h2>
      {pages.length === 0 && (
        <p className="py-8 text-center text-sm text-ink-faint">第一页还空着——等岛上的下一天开始吧。</p>
      )}
      <div className="space-y-4">
        {pages.map((d, i) => (
          <article key={d.id} className="note-slip p-4" style={{ transform: `rotate(${i % 2 === 0 ? "-0.3" : "0.3"}deg)` }}>
            <div className="flex items-center justify-between">
              <p className="text-xs text-ink-faint">猫啊岛第 {d.day} 天 · {d.mood}</p>
              <Link href={`/share/${catId}/${d.day}`} className="text-xs text-ink-faint hover:text-brick">
                分享卡
              </Link>
            </div>
            {i === 0 && firstOpen ? (
              <p className="font-diary mt-2 whitespace-pre-wrap text-[15px] leading-[1.9]">
                <LinkedText text={d.content} cats={catIndex} excludeId={catId} />
              </p>
            ) : (
              <details className="mt-2">
                <summary className="font-diary cursor-pointer list-none text-[15px] leading-relaxed text-ink-soft">
                  {d.content.slice(0, 40)}……<span className="text-xs text-ink-faint">(翻开这一页)</span>
                </summary>
                <p className="font-diary mt-2 whitespace-pre-wrap text-[15px] leading-[1.9]">
                  <LinkedText text={d.content} cats={catIndex} excludeId={catId} />
                </p>
              </details>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

/** 珍藏的小东西:它还记得的 + 今天露出的一个小秘密——像收藏物,不是数据库 */
export function CatMemoryBox({
  firstWordsLine,
  keepsakes,
  secret,
}: {
  firstWordsLine: string | null;
  keepsakes: { id: string; content: string; day: number }[];
  secret: string | null;
}) {
  if (!firstWordsLine && keepsakes.length === 0 && !secret) return null;
  return (
    <div className="note-slip mt-6 p-4" style={{ transform: "rotate(-0.4deg)" }}>
      <p className="font-title text-sm font-bold">它还记得</p>
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
          <p className="text-xs tracking-widest text-ink-faint">一个小秘密</p>
          <p className="font-diary mt-1 text-[15px] leading-relaxed text-ink">{secret}</p>
        </div>
      )}
    </div>
  );
}
