import { describe, it, expect } from "vitest";
import { visibleWishlistItems, toFamilyWishlist } from "@/lib/v2Privacy";
import type { WishlistItemRow } from "@/lib/types";

const HARUKI = "p1-uuid";
const ARISA = "p2-uuid";

function item(overrides: Partial<WishlistItemRow>): WishlistItemRow {
  return {
    id: "id-" + Math.random(),
    owner: HARUKI,
    is_private: false,
    name: "ワインセラー",
    category: "家電",
    price: 300000,
    priority: 3,
    target_date: "2027-01-01",
    saved: 50000,
    monthly_plan: 10000,
    url: null,
    memo: "",
    status: "saving",
    purchased_date: null,
    purchased_price: null,
    visible_to_family: true,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("v2 spec §2.5 ウィッシュの is_private — 相手には存在ごと非表示", () => {
  const mine = item({ id: "w1", owner: HARUKI, is_private: false });
  const myPrivate = item({ id: "w2", owner: HARUKI, is_private: true });
  const partnerPublic = item({ id: "w3", owner: ARISA, is_private: false });
  const partnerPrivate = item({ id: "w4", owner: ARISA, is_private: true, name: "サプライズ指輪", price: 500000 });
  const all = [mine, myPrivate, partnerPublic, partnerPrivate];

  it("viewer sees own items (private or not) and the partner's public items, but never the partner's private items", () => {
    const visible = visibleWishlistItems(all, HARUKI);
    expect(visible.map((i) => i.id).sort()).toEqual(["w1", "w2", "w3"]);
  });

  it("the partner's private item never appears in any form — not even as a masked placeholder", () => {
    const visible = visibleWishlistItems(all, HARUKI);
    const serialized = JSON.stringify(visible);
    expect(serialized).not.toContain("サプライズ指輪");
    expect(serialized).not.toContain("w4");
  });

  it("symmetric: Arisa sees her own items and Haruki's public item, not Haruki's private one", () => {
    const visible = visibleWishlistItems(all, ARISA);
    expect(visible.map((i) => i.id).sort()).toEqual(["w1", "w3", "w4"]);
  });
});

describe("v2 spec §5.4/§5.5 家族ロール向けウィッシュ射影（ホワイトリスト方式）", () => {
  const planningPublic = item({ id: "w1", status: "planning", is_private: false, visible_to_family: true });
  const savingPublic = item({ id: "w2", status: "saving", is_private: false, visible_to_family: true, saved: 20000, monthly_plan: 5000 });
  const privateOne = item({ id: "w3", status: "saving", is_private: true, visible_to_family: true });
  const hiddenFromFamily = item({ id: "w4", status: "saving", is_private: false, visible_to_family: false });
  const purchased = item({ id: "w5", status: "purchased", is_private: false, visible_to_family: true, purchased_date: "2026-05-01", purchased_price: 280000 });
  const dropped = item({ id: "w6", status: "dropped", is_private: false, visible_to_family: true });
  const all = [planningPublic, savingPublic, privateOne, hiddenFromFamily, purchased, dropped];

  it("only includes planning/saving, non-private, visible_to_family items", () => {
    const out = toFamilyWishlist(all);
    expect(out.map((i) => i.id).sort()).toEqual(["w1", "w2"]);
  });

  it("never exposes saved/monthly_plan/status/is_private/owner/memo/url/created_at keys", () => {
    const out = toFamilyWishlist(all);
    const serialized = JSON.stringify(out);
    for (const forbidden of ["saved", "monthly_plan", "status", "is_private", "owner", "memo", "url", "created_at", "purchased_price", "purchased_date"]) {
      expect(serialized).not.toContain(`"${forbidden}"`);
    }
  });

  it("purchased/dropped/private/hidden items never appear, not even their id", () => {
    const out = toFamilyWishlist(all);
    const ids = out.map((i) => i.id);
    expect(ids).not.toContain("w3");
    expect(ids).not.toContain("w4");
    expect(ids).not.toContain("w5");
    expect(ids).not.toContain("w6");
  });
});
