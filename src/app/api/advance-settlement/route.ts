import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { todayStrJST, shiftMonth, isValidMonthKey } from "@/lib/date";
import { getAllProfiles, makeNameLookup } from "@/lib/profiles";
import { getAccounts } from "@/lib/accounts";
import { advanceCycle, cycleKeyOfDate, latestConfirmedCycleKey, summarizeAdvances, settlementTransfer, type AdvanceCycle } from "@/lib/advanceSettlement";
import { getAdvanceRowsInRange, getAdvanceSettlements, markAdvanceSettled, unmarkAdvanceSettled } from "@/lib/advanceSettlementStore";

/** 確定済みのサイクルを何件さかのぼって見せるか（清算し忘れた月も拾えるように）。 */
const CONFIRMED_CYCLES = 3;

async function buildCycleViews() {
  const today = todayStrJST();
  const latest = latestConfirmedCycleKey(today);
  const confirmedKeys = Array.from({ length: CONFIRMED_CYCLES }, (_, i) => shiftMonth(latest, -i));
  const currentKey = cycleKeyOfDate(today);
  // 締まったがまだ金額が確定していないサイクル（今日が28日〜翌5日のときだけ存在する）。
  const pendingKey = shiftMonth(latest, 1) !== currentKey ? shiftMonth(latest, 1) : null;
  const cycles = [...confirmedKeys, ...(pendingKey ? [pendingKey] : []), currentKey].map(advanceCycle);

  const from = cycles.reduce((m, c) => (c.from < m ? c.from : m), cycles[0].from);
  const to = cycles.reduce((m, c) => (c.to > m ? c.to : m), cycles[0].to);
  const [rows, settlements, profiles, accounts] = await Promise.all([
    getAdvanceRowsInRange(from, to),
    getAdvanceSettlements(cycles.map((c) => c.key)),
    getAllProfiles(),
    getAccounts(),
  ]);
  const owners = profiles.filter((p) => p.role === "owner");
  const nameOf = makeNameLookup(profiles);
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name.replace(/（.*?）/g, "") ?? id;

  const view = (c: AdvanceCycle, status: "confirmed" | "pending" | "current") => {
    const s = summarizeAdvances(rows, c, owners.map((o) => o.id));
    // 2人の間で誰から誰にいくら払うか（口座は関係なく、相殺した1本にまとめる）。
    const t = owners.length === 2 ? settlementTransfer(rows, c, [owners[0].id, owners[1].id]) : null;
    const transfer = t ? { fromName: nameOf(t.from), toName: nameOf(t.to), amount: t.amount } : null;
    const settled = settlements.find((x) => x.cycle_key === c.key) ?? null;
    return {
      ...c,
      status,
      total: s.total,
      transfer,
      people: s.byPerson.map((p) => ({
        profileId: p.profileId,
        name: nameOf(p.profileId),
        total: p.total,
        count: p.count,
        byAccount: Object.entries(p.byAccount).map(([accountId, amount]) => ({ accountId, name: accountName(accountId), amount })),
      })),
      settled: settled ? { settledAt: settled.settled_at, settledByName: settled.settled_by ? nameOf(settled.settled_by) : null, amounts: settled.amounts } : null,
    };
  };

  return {
    today,
    confirmed: confirmedKeys.map((k) => view(advanceCycle(k), "confirmed")),
    pending: pendingKey ? view(advanceCycle(pendingKey), "pending") : null,
    current: view(advanceCycle(currentKey), "current"),
  };
}

export async function GET() {
  try {
    await requireOwnerSession();
    return NextResponse.json(await buildCycleViews());
  } catch (e) {
    return errorResponse(e);
  }
}

const bodySchema = z.object({ cycle: z.string(), settled: z.boolean() });

/** 清算済みにする／取り消す。清算できるのは金額が確定したサイクルだけ。 */
export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { cycle, settled } = bodySchema.parse(await req.json());
    if (!isValidMonthKey(cycle)) throw new ApiError(400, "invalid cycle");
    const views = await buildCycleViews();
    const target = views.confirmed.find((c) => c.key === cycle);
    if (!target) throw new ApiError(400, "まだ金額が確定していないサイクルです");
    if (settled) {
      // 清算したときの金額を残す（人ごとの立替合計と、誰から誰にいくら払ったか）。
      await markAdvanceSettled(cycle, session.profile_id, {
        ...Object.fromEntries(target.people.map((p) => [p.profileId, p.total])),
        ...(target.transfer ? { transfer: target.transfer.amount } : {}),
      });
    } else {
      await unmarkAdvanceSettled(cycle);
    }
    return NextResponse.json(await buildCycleViews());
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
