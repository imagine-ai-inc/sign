import { requireUser, isAdmin } from "@/lib/auth";
import { listUsers } from "@/lib/services/users";
import { UsersTable } from "@/components/settings/users-table";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const user = await requireUser();
  const users = await listUsers(user);
  return (
    <>
      <div className="flex items-center justify-between">
        <div><h1 className="text-[22px] font-semibold">Users</h1><p className="text-sm text-muted mt-1">People can log in with an emailed code once they're added here. Everyone else is turned away.</p></div>
      </div>
      <UsersTable users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, lastSeenAt: u.lastSeenAt ? new Date(u.lastSeenAt).toISOString() : null }))} me={{ id: user.id, role: user.role }} admin={isAdmin(user)} />
    </>
  );
}
