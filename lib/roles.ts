import type { AppUser } from "@/lib/types";
export function isAdmin(user: Pick<AppUser, "role">) {
  return user.role === "owner" || user.role === "admin";
}
