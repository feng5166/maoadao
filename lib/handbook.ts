// 手账页的展示辅助：系统数据 → 生活语言（v0.7 术语产品化）

/** 地点 → 固定场景图（5-8 幅固定背景，避免头像漂浮） */
export function sceneFor(location: string | undefined): string {
  const map: [string, string][] = [
    ["码头", "/scenes/dock.jpg"],
    ["海边礁石", "/scenes/reef.jpg"],
    ["溪流浅滩", "/scenes/reef.jpg"],
    ["松林小径", "/scenes/pines.jpg"],
    ["集市广场", "/scenes/market.jpg"],
    ["灯塔坡", "/scenes/lighthouse.jpg"],
    ["废弃渔船", "/scenes/boat.jpg"],
    ["自家小屋", "/scenes/home.jpg"],
  ];
  for (const [key, img] of map) if (location?.includes(key)) return img;
  return "/scenes/home.jpg";
}

export function todayLabel(): string {
  const d = new Date();
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

/** 状态变化标签 → 页边批注散文（"鱼币 +12" → "今天赚了 12 枚鱼币。"） */
export function marginNotes(
  stateChanges: { label: string; delta: string }[],
  threadProgress: { label: string; step: number; total?: number }[],
): string[] {
  const notes: string[] = [];
  for (const c of stateChanges) {
    if (c.label === "鱼币") {
      const n = parseInt(c.delta, 10);
      if (n > 0) notes.push(`今天赚了 ${n} 枚鱼币。`);
      else if (n < 0) notes.push(`今天花掉了 ${-n} 枚鱼币。`);
    } else if (c.label.startsWith("与")) {
      const who = c.label.slice(1);
      const positive = c.delta.trim().startsWith("+");
      const reason = c.delta.replace(/^[+\-\d\s]+/, "");
      notes.push(positive ? `${who}似乎没那么防着它了${reason ? `（${reason}）` : ""}。` : `它和${who}闹了点小别扭${reason ? `（${reason}）` : ""}。`);
    }
  }
  for (const t of threadProgress) {
    notes.push(`「${t.label}」${threadStage(t.step, t.total)}。`);
  }
  return notes;
}

/** 事件线进度 → 阶段语（精确数字进档案页） */
export function threadStage(step: number, total?: number): string {
  if (!total) return step <= 1 ? "才刚起头" : "还在继续";
  const ratio = step / total;
  if (ratio <= 0.3) return "才刚起头";
  if (ratio <= 0.7) return "越来越近了";
  return "已经接近真相";
}
