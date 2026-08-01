// 路由级骨架屏：外壳先出，数据后到——跨洋链路下把"白屏等待"换成"纸页正在翻开"
export default function Loading() {
  return (
    <div className="space-y-8 py-4" aria-busy="true">
      <div className="mx-auto h-56 max-w-md animate-pulse rounded-lg bg-paper-deep" />
      <div className="space-y-3">
        <div className="mx-auto h-6 w-3/4 max-w-sm animate-pulse rounded bg-paper-deep" />
        <div className="mx-auto h-4 w-1/2 max-w-xs animate-pulse rounded bg-paper-deep" />
      </div>
      <p className="text-center text-xs text-ink-faint">岛上正在翻页…</p>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="h-32 animate-pulse rounded-lg bg-paper-deep" />
        <div className="hidden h-32 animate-pulse rounded-lg bg-paper-deep sm:block" />
        <div className="hidden h-32 animate-pulse rounded-lg bg-paper-deep sm:block" />
      </div>
    </div>
  );
}
