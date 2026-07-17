import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getMaintenanceTasks, createMaintenanceTask } from "@/lib/maintenance";

export async function GET() {
  try {
    await requireOwnerSession();
    const tasks = await getMaintenanceTasks();
    return NextResponse.json({ tasks });
  } catch (e) {
    return errorResponse(e);
  }
}

const bodySchema = z.object({
  asset_id: z.string().uuid(),
  name: z.string().min(1).max(60),
  interval_months: z.number().int().positive().optional().nullable(),
  est_cost: z.number().nonnegative().optional().nullable(),
  next_due: z.string(),
  memo: z.string().max(500).optional().nullable(),
  visible_to_family: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    await requireOwnerSession();
    const input = bodySchema.parse(await req.json());
    const task = await createMaintenanceTask(input);
    return NextResponse.json({ task });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
