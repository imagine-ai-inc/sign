import { requireUser } from "@/lib/auth";
import { reportSummary, reportBySender, reportByMonth, type Period } from "@/lib/services/reports";
import { ReportsView } from "@/components/reports/reports-view";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const period = (["30d", "90d", "12mo", "all"].includes(sp.period || "") ? sp.period : "30d") as Period;
  const [summary, senders, months] = await Promise.all([reportSummary(user, period), reportBySender(user, period), reportByMonth(user, period)]);
  return <ReportsView period={period} summary={summary} senders={senders} months={months} />;
}
