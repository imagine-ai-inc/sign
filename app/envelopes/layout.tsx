import { requireUser } from "@/lib/auth";

export default async function EnvelopeEditorLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <div className="min-h-screen bg-paper">{children}</div>;
}
