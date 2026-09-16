export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true, service: "assetwatch", time: new Date().toISOString() });
}
