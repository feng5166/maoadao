import { prisma } from "@/lib/db";

// 海螺留声:猫的 TTS 声音(wav)。留声可能重新生成,缓存给短一些
export async function GET(_req: Request, ctx: { params: Promise<{ catId: string }> }) {
  const { catId } = await ctx.params;
  const note = await prisma.catVoiceNote.findUnique({ where: { catId } });
  if (!note) return new Response("海螺里还没有声音", { status: 404 });
  return new Response(new Uint8Array(note.data), {
    headers: {
      "Content-Type": note.mime,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
