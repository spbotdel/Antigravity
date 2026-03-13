import { toErrorResponse } from "@/lib/server/errors";
import { getDashboardBootstrap } from "@/lib/server/repository";

export async function GET() {
  try {
    const { trees: items } = await getDashboardBootstrap();

    return Response.json({ items }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
