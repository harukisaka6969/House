"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/apiClient";
import type { IdeaNoteOut, IdeaNoteColor } from "@/lib/apiTypes";
import { SectionHead } from "../common";

const COLORS: IdeaNoteColor[] = ["yellow", "blue", "green", "pink", "purple"];
const COLOR_STYLE: Record<IdeaNoteColor, { bg: string; border: string }> = {
  yellow: { bg: "rgba(245,165,36,0.14)", border: "#F5A524" },
  blue: { bg: "rgba(57,135,229,0.14)", border: "#3987E5" },
  green: { bg: "rgba(25,158,112,0.14)", border: "#199E70" },
  pink: { bg: "rgba(213,81,129,0.14)", border: "#D55181" },
  purple: { bg: "rgba(139,124,246,0.14)", border: "#8B7CF6" },
};

export default function IdeaBoard() {
  const [notes, setNotes] = useState<IdeaNoteOut[] | null>(null);
  const [content, setContent] = useState("");
  const [color, setColor] = useState<IdeaNoteColor>("yellow");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    apiGet<{ notes: IdeaNoteOut[] }>("/api/idea-notes")
      .then((r) => setNotes(r.notes))
      .catch(() => setNotes([]));
  };
  useEffect(load, []);

  if (!notes) return <div className="mf-empty">読み込み中…</div>;

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
      const fd = new FormData();
      fd.append("content", content.trim());
      fd.append("color", color);
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

  return (
    <section className="mf-section">
      <SectionHead no="17" title="アイデアボード" sub="思いついたこと・ブレインストーム・写真を自由に残せます（自分だけに表示されます）。" />

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
              style={{
                borderColor: COLOR_STYLE[c].border,
                background: color === c ? COLOR_STYLE[c].bg : "transparent",
              }}
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

      {notes.length === 0 ? (
        <div className="mf-empty">まだメモがありません。</div>
      ) : (
        <div style={{ columns: 2, columnGap: 10 }}>
          {notes.map((n) => (
            <div
              key={n.id}
              style={{
                breakInside: "avoid",
                marginBottom: 10,
                borderRadius: 12,
                padding: 12,
                background: COLOR_STYLE[n.color].bg,
                border: `1px solid ${COLOR_STYLE[n.color].border}`,
              }}
            >
              {n.photo_data_url && <img src={n.photo_data_url} alt="" style={{ width: "100%", borderRadius: 8, marginBottom: 8 }} />}
              {editingId === n.id ? (
                <>
                  <textarea
                    className="mf-input"
                    style={{ width: "100%", minHeight: 60, resize: "vertical", fontFamily: "inherit", marginBottom: 6 }}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                  />
                  <div className="mf-row">
                    <button className="mf-btn primary" style={{ padding: "4px 10px" }} onClick={saveEdit}>
                      保存
                    </button>
                    <button className="mf-btn ghost" style={{ padding: "4px 10px" }} onClick={() => setEditingId(null)}>
                      キャンセル
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {n.content && <div style={{ fontSize: 13.5, color: "#E7ECF2", whiteSpace: "pre-wrap" }}>{n.content}</div>}
                  <div className="mf-row" style={{ marginTop: 8, justifyContent: "space-between" }}>
                    <span className="mf-numsub" style={{ fontSize: 11 }}>
                      {n.created_at.slice(5, 10)}
                    </span>
                    <div className="mf-row" style={{ gap: 6 }}>
                      <button className="mf-btn ghost" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => startEdit(n)}>
                        編集
                      </button>
                      <button className="mf-del" onClick={() => remove(n.id)}>
                        ×
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
