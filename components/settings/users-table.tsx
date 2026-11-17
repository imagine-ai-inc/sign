"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { inviteUserAction, updateUserRoleAction } from "@/lib/actions/settings";
import { fmtDate, initialsOf } from "@/lib/format";
import type { Role } from "@/lib/types";

interface U { id: string; name: string; email: string; role: Role; status: string; lastSeenAt: string | null }

export function UsersTable({ users, me, admin }: { users: U[]; me: { id: string; role: Role }; admin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [inv, setInv] = useState({ name: "", email: "", role: "member" as Role });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-5 rounded-lg bg-white border border-hairline">
      <div className="flex items-center justify-between px-5 py-3 border-b border-hairline-2">
        <span className="text-sm text-muted">{users.length} user{users.length === 1 ? "" : "s"}</span>
        {admin ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus size={14} /> Add user</Button></DialogTrigger>
            <DialogContent title="Add user" description="They log in with a one time code sent to this email.">
              <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const r = await inviteUserAction(inv); setBusy(false); if (!r.ok) return setErr(r.error); setOpen(false); setInv({ name: "", email: "", role: "member" }); router.refresh(); }}>
                <div className="space-y-1.5"><Label htmlFor="i-name">Name</Label><Input id="i-name" value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} required /></div>
                <div className="space-y-1.5"><Label htmlFor="i-email">Email</Label><Input id="i-email" type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} required /></div>
                <div className="space-y-1.5"><Label htmlFor="i-role">Role</Label><NativeSelect id="i-role" className="w-full" value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value as Role })}><option value="member">Member (send and manage own envelopes)</option><option value="admin">Admin (everything plus users and workspace)</option><option value="viewer">Viewer (read only)</option>{me.role === "owner" ? <option value="owner">Owner</option> : null}</NativeSelect></div>
                {err ? <p className="text-sm text-bad">{err}</p> : null}
                <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={busy}>Add</Button></div>
              </form>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
      <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
        <thead><tr className="text-left text-[12px] uppercase tracking-wide text-muted border-b border-hairline"><th className="px-5 py-2.5 font-medium">User</th><th className="py-2.5 font-medium w-[140px]">Role</th><th className="py-2.5 font-medium w-[120px]">Status</th><th className="py-2.5 font-medium w-[130px]">Last seen</th><th className="w-[160px]"></th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-hairline-2 last:border-0">
              <td className="px-5 py-3"><div className="flex items-center gap-3"><div className="h-8 w-8 rounded-full bg-blush-2 text-[11px] font-semibold flex items-center justify-center">{initialsOf(u.name || u.email)}</div><div><div className="font-medium">{u.name || u.email}{u.id === me.id ? <span className="text-muted font-normal"> (you)</span> : null}</div><div className="text-xs text-muted">{u.email}</div></div></div></td>
              <td className="py-3 capitalize">{u.role}</td>
              <td className="py-3"><span className={"inline-block rounded px-1.5 py-0.5 text-[11px] font-medium " + (u.status === "active" ? "bg-ok-bg text-ok" : u.status === "invited" ? "bg-warn-bg text-warn" : "bg-paper-2 text-muted")}>{u.status}</span></td>
              <td className="py-3 text-muted">{u.lastSeenAt ? fmtDate(u.lastSeenAt) : "Never"}</td>
              <td className="py-2.5 pr-5 text-right">
                {admin && u.id !== me.id && (u.role !== "owner" || me.role === "owner") ? (
                  <NativeSelect className="h-8 text-[12.5px]" value={u.status === "disabled" ? "disabled" : u.role} onChange={async (e) => { const r = await updateUserRoleAction(u.id, e.target.value as Role | "disabled"); if (!r.ok) alert(r.error); router.refresh(); }}>
                    <option value="member">Member</option><option value="admin">Admin</option><option value="viewer">Viewer</option>{me.role === "owner" ? <option value="owner">Owner</option> : null}<option value="disabled">Disabled</option>
                  </NativeSelect>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
