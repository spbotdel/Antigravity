import { AppError, toErrorResponse } from "@/lib/server/errors";
import { getCurrentUser } from "@/lib/server/auth";
import { fetchSupabaseAdminRestJson } from "@/lib/supabase/admin-rest";
import type { MembershipRecord, TreeRecord } from "@/lib/types";

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new AppError(401, "Требуется авторизация.");
    }

    const memberships = await fetchSupabaseAdminRestJson<MembershipRecord[]>(
      `tree_memberships?select=*&user_id=eq.${user.id}&status=eq.active&order=created_at.asc`
    );

    if (!memberships.length) {
      return Response.json({ items: [] }, { headers: { "cache-control": "no-store" } });
    }

    const treeFilter = memberships.map((membership) => membership.tree_id).join(",");
    const trees = await fetchSupabaseAdminRestJson<TreeRecord[]>(`trees?select=*&id=in.(${treeFilter})`);
    const items = memberships
      .map((membership) => ({
        membership,
        tree: trees.find((tree) => tree.id === membership.tree_id) ?? null
      }))
      .filter((item) => item.tree !== null);

    return Response.json({ items }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
