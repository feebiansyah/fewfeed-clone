import { requireUser } from "@/lib/auth/require-user";
import { syncMetaAssets } from "@/lib/meta/sync";

export async function POST(request: Request): Promise<Response> {
  void request;
  const user = await requireUser();

  try {
    const summary = await syncMetaAssets(user.id);
    return Response.json(summary);
  } catch {
    return Response.json({ error: "META_SYNC_FAILED" }, { status: 502 });
  }
}
