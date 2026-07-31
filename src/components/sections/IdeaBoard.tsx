"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/apiClient";
import type { IdeaNoteOut, IdeaNoteColor, IdeaNoteLinkOut } from "@/lib/apiTypes";
import { SectionHead } from "../common";

const COLORS: IdeaNoteColor[] = ["yellow", "blue", "green", "pink", "purple"];
const COLOR_STYLE: Record<IdeaNoteColor, { bg: string; border: string }> = {
  yellow: { bg: "rgba(245,165,36,0.16)", border: "#F5A524" },
  blue: { bg: "rgba(57,135,229,0.16)", border: "#3987E5" },
  green: { bg: "rgba(25,158,112,0.16)", border: "#199E70" },
  pink: { bg: "rgba(213,81,129,0.16)", border: "#D55181" },
  purple: { bg: "rgba(139,124,246,0.16)", border: "#8B7CF6" },
};

const NOTE_W = 152;
const NOTE_H = 118;

export default function IdeaBoard() {
  const [notes, setNotes] = useState<IdeaNoteOut[] | null>(null);
  const [links, setLinks] = useState<IdeaNoteLinkOut[]>([]);
  const [content, setContent] = useState("");
  const [color, setColor] = useState<IdeaNoteColor>("yellow");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragState = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);

  const load = () => {
    apiGet<{ notes: IdeaNoteOut[]; links: IdeaNoteLinkOut[] }>("/api/idea-notes")
      .then((r) => {
        setNotes(r.notes);
        setLinks(r.links);
      })
      .catch(() => {
        setNotes([]);
        setLinks([]);
      });
  };
  useEffect(load, []);

  // 数秒ごとに自動更新し、パートナーが共有メモを動かしたり編集したりした内容が反映されるようにする。
  // ドラッグ中・編集中は取りに行かない（自分の操作が上書きされるのを防ぐため）。
  useEffect(() => {
    const interval = setInterval(() => {
      if (dragState.current === null && editingId === null) load();
    }, 4000);
    const onVisible = () => {
      if (document.visibilityState === "visible" && dragState.current === null && editingId === null) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [editingId]);

  if (!notes) return <div className="mf-empty">読み込み中…</div>;

  const canEdit = (n: IdeaNoteOut) => n.mine || n.visibility === "shared";

  const onPickPhoto = (f: File) => {
    setPhotoFile(f);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const clearPhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const add = async () => {
    if (!content.trim() && !photoFile) {
      setMsg("メモか写真のどちらかを入力してください。");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const x = 30 + (notes.length % 5) * (NOTE_W + 20);
      const y = 30 + Math.floor(notes.length / 5) * (NOTE_H + 30);
      const fd = new FormData();
      fd.append("content", content.trim());
      fd.append("color", color);
      fd.append("x", String(x));
      fd.append("y", String(y));
      if (photoFile) fd.append("image", photoFile);
      const res = await fetch("/api/idea-notes", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body && body.error) || "failed");
      }
      setContent("");
      clearPhoto();
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "追加に失敗しました。");
    }
    setBusy(false);
  };

  const startEdit = (n: IdeaNoteOut) => {
    setEditingId(n.id);
    setEditContent(n.content);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await apiPut(`/api/idea-notes/${editingId}`, { content: editContent });
    setEditingId(null);
    load();
  };

  const remove = async (id: string) => {
    await apiDelete(`/api/idea-notes/${id}`);
    load();
  };

  const toggleShare = async (n: IdeaNoteOut) => {
    await apiPost(`/api/idea-notes/${n.id}/share`, { shared: n.visibility !== "shared" });
    load();
  };

  const deleteLink = async (id: string) => {
    await apiDelete(`/api/idea-notes/links/${id}`);
    load();
  };

  const onNotePointerDown = (e: React.PointerEvent<HTMLDivElement>, n: IdeaNoteOut) => {
    if (connectMode || !canEdit(n)) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { id: n.id, startX: e.clientX, startY: e.clientY, origX: n.x, origY: n.y, moved: false };
  };

  const onNotePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragState.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
    setNotes((prev) => (prev ? prev.map((n) => (n.id === d.id ? { ...n, x: Math.max(0, d.origX + dx), y: Math.max(0, d.origY + dy) } : n)) : prev));
  };

  const onNotePointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragState.current;
    dragState.current = null;
    if (!d) return;
    if (!d.moved) return;
    const n = notes.find((x) => x.id === d.id);
    if (n) {
      try {
        await apiPut(`/api/idea-notes/${d.id}`, { x: Math.round(n.x), y: Math.round(n.y) });
      } catch {
        // 位置保存に失敗しても表示上は問題ないので黙って無視する（次の読み込みで正しい位置に戻る）。
      }
    }
  };

  const onNoteClick = (n: IdeaNoteOut) => {
    if (!connectMode || !canEdit(n)) return;
    if (!connectFrom) {
      setConnectFrom(n.id);
      return;
    }
    if (connectFrom === n.id) {
      setConnectFrom(null);
      return;
    }
    apiPost("/api/idea-notes/links", { from_note: connectFrom, to_note: n.id })
      .then(() => {
        setConnectFrom(null);
        load();
      })
      .catch((e) => setMsg(e instanceof Error ? e.message : "接続に失敗しました。"));
  };

  const canvasW = Math.max(900, ...notes.map((n) => n.x + NOTE_W + 60));
  const canvasH = Math.max(700, ...notes.map((n) => n.y + NOTE_H + 60));
  const center = (n: IdeaNoteOut) => ({ cx: n.x + NOTE_W / 2, cy: n.y + NOTE_H / 2 });
  const byId = new Map(notes.map((n) => [n.id, n]));

  return (
    <section className="mf-section">
      <SectionHead
        no="17"
        title="アイデアボード"
        sub="思いついたことをマインドマップ形式で自由に配置・接続できます。共有すると、その1件だけアリサも見て一緒に編集でき、数秒ごとに自動で最新の状態に更新されます。"
      />

      <div className="mf-panel">
        <div className="mf-paneltitle">新しいメモ</div>
        <textarea
          className="mf-input"
          style={{ width: "100%", minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
          placeholder="思いついたことを書く…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="mf-chips" style={{ marginTop: 8, marginBottom: 8 }}>
          {COLORS.map((c) => (
            <button
              key={c}
              className="mf-chipbtn"
              style={{ borderColor: COLOR_STYLE[c].border, background: color === c ? COLOR_STYLE[c].bg : "transparent" }}
              onClick={() => setColor(c)}
              aria-label={c}
            >
              <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: COLOR_STYLE[c].border }} />
            </button>
          ))}
        </div>
        {photoPreview && (
          <div style={{ position: "relative", marginBottom: 8, maxWidth: 160 }}>
            <img src={photoPreview} alt="" style={{ width: "100%", borderRadius: 8 }} />
            <button className="mf-del" style={{ position: "absolute", top: 4, right: 4, background: "#101418" }} onClick={clearPhoto}>
              ×
            </button>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickPhoto(f);
          }}
        />
        <div className="mf-row">
          <button className="mf-btn primary" disabled={busy} onClick={add}>
            {busy ? "追加中…" : "追加する"}
          </button>
          <button className="mf-btn ghost" onClick={() => fileRef.current?.click()}>
            📷 写真を選ぶ
          </button>
        </div>
        {msg && <div className="mf-hint">{msg}</div>}
      </div>

      <div className="mf-panel">
        <div className="mf-row" style={{ justifyContent: "space-between" }}>
          <div className="mf-paneltitle" style={{ marginBottom: 0 }}>
            マインドマップ
          </div>
          <button
            className={"mf-btn" + (connectMode ? " primary" : " ghost")}
            onClick={() => {
              setConnectMode((v) => !v);
              setConnectFrom(null);
            }}
          >
            {connectMode ? "接続モード終了" : "🔗 つなげる"}
          </button>
        </div>
        {connectMode && (
          <div className="mf-hint" style={{ marginTop: 6 }}>
            {connectFrom ? "つなげたいもう1つのメモをタップしてください。" : "つなげたい1つ目のメモをタップしてください。"}
          </div>
        )}

        {notes.length === 0 ? (
          <div className="mf-empty" style={{ marginTop: 10 }}>
            まだメモがありません。
          </div>
        ) : (
          <div style={{ overflow: "auto", marginTop: 10, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, touchAction: "pan-x pan-y", maxHeight: "70vh" }}>
            <div style={{ position: "relative", width: canvasW, height: canvasH }}>
              <svg width={canvasW} height={canvasH} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
                {links.map((l) => {
                  const a = byId.get(l.from_note);
                  const b = byId.get(l.to_note);
                  if (!a || !b) return null;
                  const p1 = center(a);
                  const p2 = center(b);
                  return <line key={l.id} x1={p1.cx} y1={p1.cy} x2={p2.cx} y2={p2.cy} stroke="#93A0AE" strokeWidth={2} strokeOpacity={0.6} />;
                })}
              </svg>
              {links.map((l) => {
                const a = byId.get(l.from_note);
                const b = byId.get(l.to_note);
                if (!a || !b) return null;
                const p1 = center(a);
                const p2 = center(b);
                const mx = (p1.cx + p2.cx) / 2;
                const my = (p1.cy + p2.cy) / 2;
                return (
                  <button
                    key={l.id}
                    className="mf-del"
                    style={{ position: "absolute", left: mx - 9, top: my - 9, background: "#101418", borderRadius: "50%" }}
                    title="接続を削除"
                    onClick={() => deleteLink(l.id)}
                  >
                    ×
                  </button>
                );
              })}
              {notes.map((n) => {
                const editable = canEdit(n);
                const selected = connectFrom === n.id;
                return (
                  <div
                    key={n.id}
                    onPointerDown={(e) => onNotePointerDown(e, n)}
                    onPointerMove={onNotePointerMove}
                    onPointerUp={onNotePointerUp}
                    onClick={() => onNoteClick(n)}
                    style={{
                      position: "absolute",
                      left: n.x,
                      top: n.y,
                      width: NOTE_W,
                      minHeight: NOTE_H,
                      borderRadius: 10,
                      padding: 8,
                      background: COLOR_STYLE[n.color].bg,
                      border: `2px solid ${selected ? "#F5A524" : COLOR_STYLE[n.color].border}`,
                      cursor: connectMode ? "pointer" : editable ? "grab" : "default",
                      touchAction: "none",
                      userSelect: "none",
                      overflow: "hidden",
                    }}
                  >
                    {n.photo_data_url && <img src={n.photo_data_url} alt="" style={{ width: "100%", height: 48, objectFit: "cover", borderRadius: 6, marginBottom: 4 }} />}
                    {editingId === n.id ? (
                      <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                        <textarea
                          className="mf-input"
                          style={{ width: "100%", minHeight: 50, resize: "vertical", fontFamily: "inherit", fontSize: 12, marginBottom: 4 }}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                        />
                        <div className="mf-row" style={{ gap: 4 }}>
                          <button className="mf-btn primary" style={{ padding: "2px 6px", fontSize: 11 }} onClick={saveEdit}>
                            保存
                          </button>
                          <button className="mf-btn ghost" style={{ padding: "2px 6px", fontSize: 11 }} onClick={() => setEditingId(null)}>
                            戻す
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {n.content && (
                          <div style={{ fontSize: 12, color: "#E7ECF2", whiteSpace: "pre-wrap", overflow: "hidden", maxHeight: 48 }}>{n.content}</div>
                        )}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
                          {!n.mine && (
                            <span className="mf-ownerchip" style={{ fontSize: 9 }}>
                              {n.owner_name}
                            </span>
                          )}
                          {n.visibility === "shared" && (
                            <span className="mf-chip" style={{ fontSize: 9, padding: "1px 5px" }}>
                              共有中
                            </span>
                          )}
                        </div>
                        {editable && !connectMode && (
                          <div onPointerDown={(e) => e.stopPropagation()} className="mf-row" style={{ gap: 3, marginTop: 4, flexWrap: "wrap" }}>
                            <button className="mf-btn ghost" style={{ padding: "1px 5px", fontSize: 10 }} onClick={() => startEdit(n)}>
                              編集
                            </button>
                            {n.mine && (
                              <button className="mf-btn ghost" style={{ padding: "1px 5px", fontSize: 10 }} onClick={() => toggleShare(n)}>
                                {n.visibility === "shared" ? "非公開に戻す" : "共有する"}
                              </button>
                            )}
                            {n.mine && (
                              <button className="mf-del" onClick={() => remove(n.id)}>
                                ×
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
