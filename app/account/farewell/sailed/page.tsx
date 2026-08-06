import { SceneImage } from "@/components/SceneImage";
import Link from "next/link";
import { AutoToDock } from "@/components/AutoToDock";

// 船开走了：送别之后的过场——不直接把人扔回领养表单，先给告别一个收尾。
// 停留片刻后自动走向码头，页面上也有手动入口。

export default function SailedPage() {
  return (
    <div className="mx-auto max-w-lg text-center">
      <div className="relative mt-6 overflow-hidden rounded-lg border border-line">
        <SceneImage
          src="/scenes/sailed.jpg"
          alt="黄昏渐深的海面，船只剩海平线上的一个小点"
          width={1200} height={686} priority className="w-full"
        />
      </div>

      <div className="fx-rise">
        <p className="font-diary mt-8 text-[17px] leading-[2.2] text-ink">
          船开走了。
          <br />
          海上安静下来，岛还是那个岛。
        </p>
      </div>

      <div className="fx-rise-2">
        <p className="mt-3 text-xs text-ink-faint">明天，新的船照常靠岸。</p>
        <Link href="/adopt" className="stamp-btn mt-6 inline-block px-8 py-2.5">
          去码头看看
        </Link>
      </div>

      <AutoToDock delayMs={8000} />
    </div>
  );
}
