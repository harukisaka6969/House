"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "@/lib/apiClient";
import type { GymSplitOut, GymExerciseOut, GymExerciseType, GymLogOut, GymSetEntry } from "@/lib/apiTypes";
import { suggestNext, suggestCardioNext } from "@/lib/gymSuggestion";
import { todayStrJST } from "@/lib/date";
import { SectionHead } from "../common";

interface SetInput {
  weight: string;
  reps: string;
}

interface CardioInput {
  duration: string;
  distance: string;
}

const emptySetInput: SetInput = { weight: "", reps: "" };
const emptyCardioInput: CardioInput = { duration: "", distance: "" };

function fmtWeight(w: number): string {
  return w > 0 ? `${w}kg` : "自重";
}

export default function GymLog() {
  const [data, setData] = useState<{ splits: GymSplitOut[]; exercises: GymExerciseOut[]; logs: GymLogOut[] } | null>(null);
  const [splitId, setSplitId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const [newSplitCode, setNewSplitCode] = useState("");
  const [newSplitLabel, setNewSplitLabel] = useState("");
  const [showAddSplit, setShowAddSplit] = useState(false);

  const [newExerciseName, setNewExerciseName] = useState("");
  const [newExerciseType, setNewExerciseType] = useState<GymExerciseType>("strength");
  const [showAddExercise, setShowAddExercise] = useState(false);

  const [setInputs, setSetInputs] = useState<Record<string, SetInput[]>>({});
  const [cardioInputs, setCardioInputs] = useState<Record<string, CardioInput>>({});
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});

  const load = () => {
    apiGet<{ splits: GymSplitOut[]; exercises: GymExerciseOut[]; logs: GymLogOut[] }>("/api/gym-log")
      .then((r) => {
        setData(r);
        setSplitId((cur) => cur ?? r.splits[0]?.id ?? null);
      })
      .catch(() => setData({ splits: [], exercises: [], logs: [] }));
  };
  useEffect(load, []);

  if (!data) return <div className="mf-empty">読み込み中…</div>;

  const { splits, exercises, logs } = data;
  const split = splits.find((s) => s.id === splitId) ?? null;
  const splitExercises = exercises.filter((e) => e.split_id === splitId).sort((a, b) => a.sort - b.sort);

  const logsForExercise = (exerciseId: string) => logs.filter((l) => l.exercise_id === exerciseId);

  const getSetInputs = (exerciseId: string): SetInput[] => setInputs[exerciseId] ?? [{ ...emptySetInput }];
  const setExerciseInputs = (exerciseId: string, sets: SetInput[]) => setSetInputs((m) => ({ ...m, [exerciseId]: sets }));
  const getCardioInput = (exerciseId: string): CardioInput => cardioInputs[exerciseId] ?? { ...emptyCardioInput };
  const setCardioInput = (exerciseId: string, input: CardioInput) => setCardioInputs((m) => ({ ...m, [exerciseId]: input }));

  const addSplit = async () => {
    if (!newSplitCode.trim() || !newSplitLabel.trim()) return;
    const { split: created } = await apiPost<{ split: GymSplitOut }>("/api/gym-log/splits", {
      code: newSplitCode.trim(),
      label: newSplitLabel.trim(),
      sort: splits.length,
    });
    setNewSplitCode("");
    setNewSplitLabel("");
    setShowAddSplit(false);
    setSplitId(created.id);
    load();
  };

  const removeSplit = async (id: string) => {
    if (!confirm("このスプリットと配下の種目・記録の紐付けが解除されます（記録自体は削除されません）。削除しますか？")) return;
    await apiDelete(`/api/gym-log/splits/${id}`);
    if (splitId === id) setSplitId(null);
    load();
  };

  const addExercise = async () => {
    if (!newExerciseName.trim() || !splitId) return;
    await apiPost("/api/gym-log/exercises", {
      split_id: splitId,
      name: newExerciseName.trim(),
      sort: splitExercises.length,
      type: newExerciseType,
    });
    setNewExerciseName("");
    setNewExerciseType("strength");
    setShowAddExercise(false);
    load();
  };

  const removeExercise = async (id: string) => {
    if (!confirm("この種目を削除しますか？（過去の記録は残ります）")) return;
    await apiDelete(`/api/gym-log/exercises/${id}`);
    load();
  };

  const submitStrengthLog = async (exerciseId: string) => {
    const inputs = getSetInputs(exerciseId);
    const sets: GymSetEntry[] = inputs
      .filter((s) => s.reps.trim() !== "")
      .map((s) => ({ weight: Number(s.weight) || 0, reps: Number(s.reps) || 0 }));
    if (sets.length === 0) {
      setMsg("少なくとも1セットは回数を入力してください。");
      return;
    }
    setMsg("");
    try {
      await apiPost("/api/gym-log/logs", {
        exercise_id: exerciseId,
        date: todayStrJST(),
        sets,
        note: noteInputs[exerciseId] ?? "",
        splitLabel: split?.label,
      });
      setExerciseInputs(exerciseId, [{ ...emptySetInput }]);
      setNoteInputs((m) => ({ ...m, [exerciseId]: "" }));
      setMsg("✓ 記録しました。");
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "記録に失敗しました。");
    }
  };

  const submitCardioLog = async (exerciseId: string) => {
    const input = getCardioInput(exerciseId);
    const duration = input.duration.trim() ? Number(input.duration) : null;
    const distance = input.distance.trim() ? Number(input.distance) : null;
    if (!duration && !distance) {
      setMsg("時間か距離のどちらかは入力してください。");
      return;
    }
    setMsg("");
    try {
      await apiPost("/api/gym-log/logs", {
        exercise_id: exerciseId,
        date: todayStrJST(),
        duration_minutes: duration,
        distance_km: distance,
        note: noteInputs[exerciseId] ?? "",
        splitLabel: split?.label,
      });
      setCardioInput(exerciseId, { ...emptyCardioInput });
      setNoteInputs((m) => ({ ...m, [exerciseId]: "" }));
      setMsg("✓ 記録しました。");
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "記録に失敗しました。");
    }
  };

  const deleteLog = async (id: string) => {
    await apiDelete(`/api/gym-log/logs/${id}`);
    load();
  };

  return (
    <section className="mf-section">
      <SectionHead no="14" title="筋トレログ" sub="今日はどの部位をやるか選んで、前回の記録と提案を見ながら記録します。有酸素はどのスプリットでも記録できます。" />

      {splits.length === 0 && !showAddSplit && (
        <div className="mf-panel">
          <div className="mf-empty">まだスプリット（分割）がありません。まずは「胸・背中の日」のように作成してください。</div>
          <button className="mf-btn primary" style={{ marginTop: 10 }} onClick={() => setShowAddSplit(true)}>
            ＋ スプリットを作成
          </button>
        </div>
      )}

      {splits.length > 0 && (
        <div className="mf-chips" style={{ marginBottom: 10 }}>
          {splits.map((s) => (
            <button key={s.id} className={"mf-chipbtn" + (splitId === s.id ? " on" : "")} onClick={() => setSplitId(s.id)}>
              {s.code} · {s.label}
            </button>
          ))}
          <button className="mf-chipbtn" onClick={() => setShowAddSplit((v) => !v)}>
            ＋ スプリット追加
          </button>
        </div>
      )}

      {showAddSplit && (
        <div className="mf-panel">
          <label className="mf-fieldlabel" htmlFor="gym-split-code">
            コード（例: F）
          </label>
          <input id="gym-split-code" className="mf-input" value={newSplitCode} onChange={(e) => setNewSplitCode(e.target.value)} />
          <label className="mf-fieldlabel" htmlFor="gym-split-label">
            名前（例: Cardio）
          </label>
          <input id="gym-split-label" className="mf-input" value={newSplitLabel} onChange={(e) => setNewSplitLabel(e.target.value)} />
          <div className="mf-row" style={{ marginTop: 10 }}>
            <button className="mf-btn primary" onClick={addSplit}>
              作成する
            </button>
            <button className="mf-btn ghost" onClick={() => setShowAddSplit(false)}>
              キャンセル
            </button>
          </div>
        </div>
      )}

      {split && (
        <>
          <div className="mf-row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
            <div className="mf-paneltitle" style={{ marginBottom: 0 }}>
              {split.code} · {split.label}
            </div>
            <button className="mf-del" onClick={() => removeSplit(split.id)}>
              スプリットを削除
            </button>
          </div>

          {splitExercises.length === 0 && <div className="mf-empty">この日の種目がまだありません。</div>}

          {splitExercises.map((ex) => {
            const exLogs = logsForExercise(ex.id);
            const isCardio = ex.type === "cardio";
            const suggestion = isCardio
              ? suggestCardioNext(exLogs.map((l) => ({ date: l.date, duration_minutes: l.duration_minutes, distance_km: l.distance_km })))
              : suggestNext(exLogs.map((l) => ({ date: l.date, sets: l.sets })));

            return (
              <div key={ex.id} className="mf-panel">
                <div className="mf-row" style={{ justifyContent: "space-between" }}>
                  <div className="mf-paneltitle" style={{ marginBottom: 0 }}>
                    {ex.name}
                    {isCardio && (
                      <span className="mf-chip" style={{ marginLeft: 6, fontSize: 10 }}>
                        有酸素
                      </span>
                    )}
                  </div>
                  <button className="mf-del" onClick={() => removeExercise(ex.id)}>
                    ×
                  </button>
                </div>

                <div className="mf-hint" style={{ opacity: 0.85, marginTop: 6 }}>
                  ✦ {suggestion}
                </div>

                {exLogs.length > 0 && (
                  <div className="mf-hint" style={{ opacity: 0.6, marginTop: 4 }}>
                    履歴:{" "}
                    {exLogs.slice(0, 3).map((l, i) => (
                      <span key={l.id}>
                        {i > 0 && " ／ "}
                        {l.date.slice(5)}:{" "}
                        {isCardio
                          ? [l.duration_minutes ? `${l.duration_minutes}分` : null, l.distance_km ? `${l.distance_km}km` : null]
                              .filter(Boolean)
                              .join(" ")
                          : `${fmtWeight(l.sets[0]?.weight ?? 0)} × ${l.sets.map((s) => s.reps).join("/")}`}
                        <button
                          className="mf-del"
                          style={{ padding: "0 2px", marginLeft: 2 }}
                          title="この記録を削除"
                          onClick={() => deleteLog(l.id)}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 10 }}>
                  {isCardio ? (
                    <div className="mf-row" style={{ marginBottom: 6 }}>
                      <input
                        className="mf-input mf-mono"
                        style={{ maxWidth: 120 }}
                        type="number"
                        placeholder="時間（分）"
                        value={getCardioInput(ex.id).duration}
                        onChange={(e) => setCardioInput(ex.id, { ...getCardioInput(ex.id), duration: e.target.value })}
                      />
                      <input
                        className="mf-input mf-mono"
                        style={{ maxWidth: 120 }}
                        type="number"
                        placeholder="距離（km）"
                        value={getCardioInput(ex.id).distance}
                        onChange={(e) => setCardioInput(ex.id, { ...getCardioInput(ex.id), distance: e.target.value })}
                      />
                    </div>
                  ) : (
                    getSetInputs(ex.id).map((s, i) => {
                      const inputs = getSetInputs(ex.id);
                      return (
                        <div key={i} className="mf-row" style={{ marginBottom: 6 }}>
                          <input
                            className="mf-input mf-mono"
                            style={{ maxWidth: 100 }}
                            type="number"
                            placeholder="kg"
                            value={s.weight}
                            onChange={(e) => {
                              const next = [...inputs];
                              next[i] = { ...next[i], weight: e.target.value };
                              setExerciseInputs(ex.id, next);
                            }}
                          />
                          <input
                            className="mf-input mf-mono"
                            style={{ maxWidth: 100 }}
                            type="number"
                            placeholder="回数"
                            value={s.reps}
                            onChange={(e) => {
                              const next = [...inputs];
                              next[i] = { ...next[i], reps: e.target.value };
                              setExerciseInputs(ex.id, next);
                            }}
                          />
                          {inputs.length > 1 && (
                            <button className="mf-del" onClick={() => setExerciseInputs(ex.id, inputs.filter((_, j) => j !== i))}>
                              ×
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                  {!isCardio && (
                    <button
                      className="mf-btn ghost"
                      style={{ padding: "4px 10px" }}
                      onClick={() => {
                        const inputs = getSetInputs(ex.id);
                        setExerciseInputs(ex.id, [...inputs, { weight: inputs[inputs.length - 1]?.weight ?? "", reps: "" }]);
                      }}
                    >
                      ＋ セット追加
                    </button>
                  )}
                  <input
                    className="mf-input"
                    style={{ marginTop: 8 }}
                    placeholder="メモ（任意）"
                    value={noteInputs[ex.id] ?? ""}
                    onChange={(e) => setNoteInputs((m) => ({ ...m, [ex.id]: e.target.value }))}
                  />
                  <div className="mf-row" style={{ marginTop: 8 }}>
                    <button className="mf-btn primary" onClick={() => (isCardio ? submitCardioLog(ex.id) : submitStrengthLog(ex.id))}>
                      記録する
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {!showAddExercise ? (
            <button className="mf-btn ghost" onClick={() => setShowAddExercise(true)}>
              ＋ 種目を追加
            </button>
          ) : (
            <div className="mf-panel">
              <input
                className="mf-input"
                placeholder="種目名（例: Incline DB Press）"
                value={newExerciseName}
                onChange={(e) => setNewExerciseName(e.target.value)}
              />
              <div className="mf-chips" style={{ marginTop: 8 }}>
                <button
                  className={"mf-chipbtn" + (newExerciseType === "strength" ? " on" : "")}
                  onClick={() => setNewExerciseType("strength")}
                >
                  筋トレ（重量×回数）
                </button>
                <button className={"mf-chipbtn" + (newExerciseType === "cardio" ? " on" : "")} onClick={() => setNewExerciseType("cardio")}>
                  有酸素（時間・距離）
                </button>
              </div>
              <div className="mf-row" style={{ marginTop: 8 }}>
                <button className="mf-btn primary" onClick={addExercise}>
                  追加する
                </button>
                <button className="mf-btn ghost" onClick={() => setShowAddExercise(false)}>
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {msg && <div className="mf-hint">{msg}</div>}
    </section>
  );
}
