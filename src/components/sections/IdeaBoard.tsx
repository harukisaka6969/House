"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/apiClient";
import type { IdeaNoteOut, IdeaNoteColor, IdeaNoteLinkOut, IdeaBoardOut } from "@/lib/apiTypes";
import { SectionHead } from "../common";

const COLORS: IdeaNoteColor[] = ["yellow", "blue", "green", "pink", "purple"];
const COLOR_STYLE: Record<IdeaNoteColor, { bg: string; border: string }> = {
  yellow: { bg: "rgba(245,165,36,0.16)", border: "#F5A524" },
  blue: { bg: "rgba(57,135,229,0.16)", border: "#3987E5" },
  green: { bg: "rgba(25,158,112,0.16)", border: "#199E70" },
  pink: { bg: "rgba(213,81,129,0.16)", border: "#D55181" },
  purple: { bg: "rgba(139,124,246,0.16)", border: "#8B7CF6" },
};

const NOTE_W = 156;
const NOTE_H = 130;
const LINE_COLOR = "#5B8DB8";
const SHARED_ID = "__shared__";

function center(n: { x: number; y: number }) {
  return { cx: n.x + NOTE_W / 2, cy: n.y + NOTE_H / 2 };
}

/** p1→p2の間を少し湾曲させたパス。同じノード間・近いノード間で複数の線が完全に重ならないようにする。 */
function curvedPath(p1: { cx: number; cy: number }, p2: { cx: number; cy: number }) {
  const mx = (p1.cx + p2.cx) / 2;
  const my = (p1.cy + p2.cy) / 2;
  const dx = p2.cx - p1.cx;
  const dy = p2.cy - p1.cy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const offset = 18;
  const cx = mx + nx * offset;
  const cy = my + ny * offset;
  return { d: `M ${p1.cx} ${p1.cy} Q ${cx} ${cy} ${p2.cx} ${p2.cy}`, mid: { x: 0.25 * p1.cx + 0.5 * cx + 0.25 * p2.cx, y: 0.25 * p1.cy + 0.5 * cy + 0.25 * p2.cy } };
}

export default function IdeaBoard() {
  const [boards, setBoards] = useState<IdeaBoardOut[] | null>(null);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [searchQuery, setSearchQuery] = useState("");
  const [notes, setNotes] = useState<IdeaNoteOut[] | null>(null);
  const [links, setLinks] = useState<IdeaNoteLinkOut[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [color, setColor] = useState<IdeaNoteColor>("yellow");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [showNewBoard, setShowNewBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [renamingBoard, setRenamingBoard] = useState(false);
  const [boardNameDraft, setBoardNameDraft] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const dragState = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);

  const loadBoards = () => {
    apiGet<{ boards: IdeaBoardOut[] }>("/api/idea-boards")
      .then((r) => {
        setBoards(r.boards);
        setActiveBoardId((cur) => cur ?? r.boards[0]?.id ?? null);
      })
      .catch(() => setBoards([]));
  };
  useEffect(loadBoards, []);

  const load = () => {
    const params = new URLSearchParams();
    if (viewMode === "list") {
      if (!searchQuery.trim()) return;
      params.set("q", searchQuery.trim());
    } else if (activeBoardId === SHARED_ID) {
      params.set("shared", "1");
    } else if (activeBoardId) {
      params.set("board_id", activeBoardId);
    } else {
      return;
    }
    apiGet<{ notes: IdeaNoteOut[]; links: IdeaNoteLinkOut[] }>(`/api/idea-notes?${params.toString()}`)
      .then((r) => {
        setNotes(r.notes);
        setLinks(r.links);
      })
      .catch(() => {
        setNotes([]);
        setLinks([]);
      });
  };
  useEffect(() => {
    if (viewMode === "map" && activeBoardId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBoardId, viewMode]);
  useEffect(() => {
    if (viewMode !== "list") return;
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, viewMode]);

  // 数秒ごとに自動更新し、共有中のメモへのパートナーの変更がほぼリアルタイムに反映されるようにする。
  useEffect(() => {
    if (viewMode !== "map") return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, viewMode, activeBoardId]);

  if (!boards) return <div className="mf-empty">読み込み中…</div>;

  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? null;
  const canEditNote = (n: IdeaNoteOut) => n.mine || n.visibility === "shared";
  const linkCountFor = (id: string) => links.filter((l) => l.from_note === id || l.to_note === id).length;

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

  const nextPos = () => ({
    x: 30 + ((notes?.length ?? 0) % 5) * (NOTE_W + 20),
    y: 30 + Math.floor((notes?.length ?? 0) / 5) * (NOTE_H + 30),
  });

  const add = async () => {
    if (!activeBoardId || activeBoardId === SHARED_ID) return;
    if (!title.trim() && !content.trim() && !photoFile) {
      setMsg("タイトル・メモ・写真のいずれかを入力してください。");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const { x, y } = nextPos();
      const fd = new FormData();
      fd.append("board_id", activeBoardId);
      fd.append("title", title.trim());
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
      setTitle("");
      setContent("");
      clearPhoto();
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "追加に失敗しました。");
    }
    setBusy(false);
  };

  const quickAddOnCanvas = async () => {
    if (!activeBoardId || activeBoardId === SHARED_ID) return;
    const { x, y } = nextPos();
    const fd = new FormData();
    fd.append("board_id", activeBoardId);
    fd.append("title", "新しいメモ");
    fd.append("content", "");
    fd.append("color", color);
    fd.append("x", String(x));
    fd.append("y", String(y));
    const res = await fetch("/api/idea-notes", { method: "POST", body: fd });
    if (!res.ok) return;
    const { note } = (await res.json()) as { note: { id: string } };
    load();
    setEditingId(note.id);
    setEditTitle("新しいメモ");
    setEditContent("");
  };

  const startEdit = (n: IdeaNoteOut) => {
    setEditingId(n.id);
    setEditTitle(n.title);
    setEditContent(n.content);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await apiPut(`/api/idea-notes/${editingId}`, { title: editTitle, content: editContent });
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

  const createBoard = async () => {
    if (!newBoardName.trim()) return;
    const r = await apiPost<{ board: IdeaBoardOut }>("/api/idea-boards", { name: newBoardName.trim() });
    setNewBoardName("");
    setShowNewBoard(false);
    setBoards((prev) => [...(prev ?? []), r.board]);
    setActiveBoardId(r.board.id);
    setViewMode("map");
  };

  const saveBoardName = async () => {
    if (!activeBoardId || activeBoardId === SHARED_ID || !boardNameDraft.trim()) {
      setRenamingBoard(false);
      return;
    }
    const r = await apiPut<{ board: IdeaBoardOut }>(`/api/idea-boards/${activeBoardId}`, { name: boardNameDraft.trim() });
    setBoards((prev) => (prev ?? []).map((b) => (b.id === r.board.id ? r.board : b)));
    setRenamingBoard(false);
  };

  const deleteBoard = async () => {
    if (!activeBoardId || activeBoardId === SHARED_ID) return;
    if (!window.confirm(`「${activeBoard?.name}」を削除しますか？中のメモもすべて削除されます。`)) return;
    await apiDelete(`/api/idea-boards/${activeBoardId}`);
    setActiveBoardId(null);
    loadBoards();
  };

  const onNotePointerDown = (e: React.PointerEvent<HTMLDivElement>, n: IdeaNoteOut) => {
    if (connectMode || !canEditNote(n)) return;
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

  const onNotePointerUp = async () => {
    const d = dragState.current;
    dragState.current = null;
    if (!d || !d.moved) return;
    const n = notes?.find((x) => x.id === d.id);
    if (n) {
      try {
        await apiPut(`/api/idea-notes/${d.id}`, { x: Math.round(n.x), y: Math.round(n.y) });
      } catch {
        // 位置保存に失敗しても表示上は問題ないので黙って無視する（次の読み込みで正しい位置に戻る）。
      }
    }
  };

  const onNoteClick = (n: IdeaNoteOut) => {
    if (!connectMode || !canEditNote(n)) return;
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

  const jumpToNote = (n: IdeaNoteOut) => {
    setViewMode("map");
    setActiveBoardId(n.mine ? n.board_id : SHARED_ID);
  };

  const mapNotes = notes ?? [];
  const canvasW = Math.max(900, ...mapNotes.map((n) => n.x + NOTE_W + 60));
  const canvasH = Math.max(700, ...mapNotes.map((n) => n.y + NOTE_H + 60));
  const byId = new Map(mapNotes.map((n) => [n.id, n]));

  return (
    <section className="mf-section">
      <SectionHead
        no="17"
        title="アイデアボード"
        sub="思いついたことをマインドマップ形式で自由に配置・接続できます。共有すると、その1件だけアリサも見て一緒に編集でき、数秒ごとに自動で最新の状態に更新されます。"
      />

      <div className="mf-chips" style={{ marginBottom: 10 }}>
        {boards.map((b) => (
          <button
            key={b.id}
            className={"mf-chipbtn" + (viewMode === "map" && activeBoardId === b.id ? " on" : "")}
            onClick={() => {
              setActiveBoardId(b.id);
              setViewMode("map");
            }}
          >
            {b.name}
          </button>
        ))}
        <button
          className={"mf-chipbtn" + (viewMode === "map" && activeBoardId === SHARED_ID ? " on" : "")}
          onClick={() => {
            setActiveBoardId(SHARED_ID);
            setViewMode("map");
          }}
        >
          🔗 共有
        </button>
        <button className={"mf-chipbtn" + (viewMode === "list" ? " on" : "")} onClick={() => setViewMode("list")}>
          🔍 一覧・検索
        </button>
        <button className="mf-chipbtn" onClick={() => setShowNewBoard((v) => !v)}>
          ＋ 新しいボード
        </button>
      </div>

      {showNewBoard && (
        <div className="mf-panel">
          <div className="mf-row">
            <input
              className="mf-input"
              style={{ flex: 1 }}
              placeholder="ボード名（例: 旅行のアイデア）"
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createBoard();
              }}
            />
            <button className="mf-btn primary" onClick={createBoard}>
              作成
            </button>
          </div>
        </div>
      )}

      {viewMode === "list" ? (
        <div className="mf-panel">
          <div className="mf-paneltitle">タイトル・本文で検索</div>
          <input
            className="mf-input"
            placeholder="キーワードを入力…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {!searchQuery.trim() ? (
            <div className="mf-empty" style={{ marginTop: 10 }}>
              検索キーワードを入力してください。
            </div>
          ) : notes === null ? (
            <div className="mf-empty" style={{ marginTop: 10 }}>
              検索中…
            </div>
          ) : notes.length === 0 ? (
            <div className="mf-empty" style={{ marginTop: 10 }}>
              見つかりませんでした。
            </div>
          ) : (
            <div className="mf-list" style={{ maxHeight: "none", marginTop: 10 }}>
              {notes.map((n) => (
                <div key={n.id} className="mf-listrow" style={{ cursor: "pointer" }} onClick={() => jumpToNote(n)}>
                  <span style={{ flex: "0 0 auto", width: 10, height: 10, borderRadius: "50%", background: COLOR_STYLE[n.color].border }} />
                  <span className="mf-shopname">{n.title || "（無題）"}</span>
                  <span className="mf-listmemo">{n.content}</span>
                  {!n.mine && <span className="mf-ownerchip">{n.owner_name}</span>}
                  {n.mine && n.board_name && (
                    <span className="mf-numsub" style={{ flex: "0 0 auto" }}>
                      {n.board_name}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="mf-panel">
            <div className="mf-paneltitle">新しいメモ</div>
            <input
              className="mf-input"
              style={{ marginBottom: 8 }}
              placeholder="タイトル（任意）"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
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
              <button className="mf-btn primary" disabled={busy || activeBoardId === SHARED_ID} onClick={add}>
                {busy ? "追加中…" : "追加する"}
              </button>
              <button className="mf-btn ghost" onClick={() => fileRef.current?.click()}>
                📷 写真を選ぶ
              </button>
            </div>
            {activeBoardId === SHARED_ID && <div className="mf-hint">共有ビューには直接追加できません。ボードでメモを作って共有してください。</div>}
            {msg && <div className="mf-hint">{msg}</div>}
          </div>

          <div className="mf-panel">
            <div className="mf-row" style={{ justifyContent: "space-between" }}>
              {renamingBoard ? (
                <div className="mf-row" style={{ flex: 1 }}>
                  <input className="mf-input" style={{ flex: 1 }} value={boardNameDraft} onChange={(e) => setBoardNameDraft(e.target.value)} />
                  <button className="mf-btn primary" style={{ padding: "4px 10px" }} onClick={saveBoardName}>
                    保存
                  </button>
                </div>
              ) : (
                <div className="mf-paneltitle" style={{ marginBottom: 0 }}>
                  {activeBoardId === SHARED_ID ? "🔗 共有（ふたりの共有メモ）" : activeBoard?.name ?? "マインドマップ"}
                </div>
              )}
              <div className="mf-row" style={{ flex: "0 0 auto", gap: 6 }}>
                {activeBoardId !== SHARED_ID && !renamingBoard && (
                  <>
                    <button
                      className="mf-btn ghost"
                      style={{ padding: "4px 8px" }}
                      onClick={() => {
                        setBoardNameDraft(activeBoard?.name ?? "");
                        setRenamingBoard(true);
                      }}
                    >
                      ✎
                    </button>
                    <button className="mf-btn ghost" style={{ padding: "4px 8px" }} onClick={deleteBoard}>
                      🗑
                    </button>
                  </>
                )}
                {activeBoardId !== SHARED_ID && (
                  <button className="mf-btn ghost" onClick={quickAddOnCanvas}>
                    ＋ メモ追加
                  </button>
                )}
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
            </div>
            {connectMode && (
              <div className="mf-hint" style={{ marginTop: 6 }}>
                {connectFrom ? "つなげたいもう1つのメモをタップしてください。1つのメモから複数につなげられます。" : "つなげたい1つ目のメモをタップしてください。"}
              </div>
            )}

            {mapNotes.length === 0 ? (
              <div className="mf-empty" style={{ marginTop: 10 }}>
                まだメモがありません。
              </div>
            ) : (
              <div
                style={{ overflow: "auto", marginTop: 10, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, touchAction: "pan-x pan-y", maxHeight: "70vh" }}
              >
                <div style={{ position: "relative", width: canvasW, height: canvasH }}>
                  <svg width={canvasW} height={canvasH} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
                    <defs>
                      <marker id="idea-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill={LINE_COLOR} />
                      </marker>
                    </defs>
                    {links.map((l) => {
                      const a = byId.get(l.from_note);
                      const b = byId.get(l.to_note);
                      if (!a || !b) return null;
                      const { d } = curvedPath(center(a), center(b));
                      return <path key={l.id} d={d} stroke={LINE_COLOR} strokeWidth={2} fill="none" opacity={0.8} markerEnd="url(#idea-arrow)" />;
                    })}
                  </svg>
                  {links.map((l) => {
                    const a = byId.get(l.from_note);
                    const b = byId.get(l.to_note);
                    if (!a || !b) return null;
                    const { mid } = curvedPath(center(a), center(b));
                    return (
                      <button
                        key={l.id}
                        className="mf-del"
                        style={{ position: "absolute", left: mid.x - 9, top: mid.y - 9, background: "#101418", borderRadius: "50%" }}
                        title="接続を削除"
                        onClick={() => deleteLink(l.id)}
                      >
                        ×
                      </button>
                    );
                  })}
                  {mapNotes.map((n) => {
                    const editable = canEditNote(n);
                    const selected = connectFrom === n.id;
                    const lc = linkCountFor(n.id);
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
                        {n.photo_data_url && (
                          <img src={n.photo_data_url} alt="" style={{ width: "100%", height: 44, objectFit: "cover", borderRadius: 6, marginBottom: 4 }} />
                        )}
                        {editingId === n.id ? (
                          <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                            <input
                              className="mf-input"
                              style={{ width: "100%", fontSize: 12, marginBottom: 4, padding: "4px 6px" }}
                              placeholder="タイトル"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                            />
                            <textarea
                              className="mf-input"
                              style={{ width: "100%", minHeight: 44, resize: "vertical", fontFamily: "inherit", fontSize: 12, marginBottom: 4 }}
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
                            {n.title && <div style={{ fontSize: 12.5, fontWeight: 700, color: "#E7ECF2" }}>{n.title}</div>}
                            {n.content && (
                              <div style={{ fontSize: 11.5, color: "#C4CDD6", whiteSpace: "pre-wrap", overflow: "hidden", maxHeight: 40, marginTop: 2 }}>
                                {n.content}
                              </div>
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
                              {lc > 0 && (
                                <span className="mf-chip" style={{ fontSize: 9, padding: "1px 5px" }}>
                                  🔗{lc}
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
        </>
      )}
    </section>
  );
}
