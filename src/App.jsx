import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default function App() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [authSending, setAuthSending] = useState(false);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [checkins, setCheckins] = useState([]);

  const [newOTitle, setNewOTitle] = useState("");
  const [newOError, setNewOError] = useState("");

  // 每个 O 独立的 KR 草稿
  const [krDrafts, setKrDrafts] = useState({});

  // 每个 KR 独立的月度复盘草稿
  const [checkinDrafts, setCheckinDrafts] = useState({});

  // ---------- Auth ----------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session)
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  // ---------- Data ----------
  useEffect(() => {
    if (session) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function loadAll() {
    setLoading(true);

    const [{ data: items, error: itemsErr }, { data: cks, error: cksErr }] =
      await Promise.all([
        supabase.from("okr_items").select("*").order("created_at", { ascending: true }),
        supabase.from("okr_checkins").select("*").order("created_at", { ascending: true }),
      ]);

    setLoading(false);

    if (itemsErr) {
      alert("加载 okr_items 失败：" + (itemsErr.message || "unknown error"));
      setRows([]);
      return;
    }
    if (cksErr) {
      alert("加载 okr_checkins 失败：" + (cksErr.message || "unknown error"));
      setCheckins([]);
    } else {
      setCheckins(cks || []);
    }

    const data = items || [];
    setRows(data);

    // 初始化草稿
    const os = data.filter((i) => i.type === "O");
    const krs = data.filter((i) => i.type === "KR");

    setKrDrafts((prev) => {
      const next = { ...prev };
      for (const o of os) {
        if (!next[o.id]) next[o.id] = { title: "", target: "", current: "", error: "", saving: false };
      }
      return next;
    });

    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    setCheckinDrafts((prev) => {
      const next = { ...prev };
      for (const kr of krs) {
        if (!next[kr.id]) next[kr.id] = { month: ym, value: "", note: "", saving: false, error: "" };
      }
      return next;
    });
  }

  const objectives = useMemo(() => {
    const os = rows.filter((r) => r.type === "O");
    const krs = rows.filter((r) => r.type === "KR");
    return os.map((o) => ({
      ...o,
      krs: krs.filter((k) => k.parent_id === o.id),
    }));
  }, [rows]);

  const checkinsByKr = useMemo(() => {
    const map = {};
    for (const c of checkins) {
      if (!map[c.kr_id]) map[c.kr_id] = [];
      map[c.kr_id].push(c);
    }
    return map;
  }, [checkins]);

  // ---------- Helpers ----------
  function safeNumber(input) {
    if (input === "" || input === null || input === undefined) return 0;
    const n = Number(input);
    return Number.isFinite(n) ? n : NaN;
  }

  function calcProgress(current, target) {
    const t = Number(target);
    const c = Number(current);
    if (!Number.isFinite(t) || t <= 0) return 0;
    if (!Number.isFinite(c) || c <= 0) return 0;
    const p = Math.round((c / t) * 100);
    return Math.max(0, Math.min(999, p));
  }

  function ymToFirstDay(ym) {
    if (!ym || ym.length < 7) return null;
    return `${ym}-01`;
  }

  // ---------- Auth Actions ----------
  async function signIn() {
    if (!email.trim()) return alert("请输入邮箱");
    setAuthSending(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
    setAuthSending(false);

    if (error) return alert("发送登录链接失败：" + (error.message || "unknown error"));
    alert("登录链接已发送到邮箱（若没收到请看垃圾箱）");
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  // ---------- OKR Actions ----------
  async function addObjective() {
    const title = newOTitle.trim();
    if (!title) {
      setNewOError("请先填写 Objective");
      return;
    }
    setNewOError("");

    const payload = {
      id: crypto.randomUUID(),
      title,
      type: "O",
      level: "company",
      department: "company",
      owner_id: session.user.id,
      owner_email: session.user.email,
      owner_name: session.user.email,
    };

    setLoading(true);
    const { error } = await supabase.from("okr_items").insert(payload);
    setLoading(false);

    if (error) return alert("新增 O 失败：" + (error.message || "unknown error"));

    setNewOTitle("");
    await loadAll();
  }

  async function updateItem(id, patch) {
    const { error } = await supabase.from("okr_items").update(patch).eq("id", id);
    if (error) {
      alert("保存失败：" + (error.message || "unknown error"));
      return false;
    }
    return true;
  }

  async function deleteItem(id, label) {
    if (!confirm(`确认删除：${label}？\n（删除 KR 会连带删除其复盘记录）`)) return;
    const { error } = await supabase.from("okr_items").delete().eq("id", id);
    if (error) {
      alert("删除失败：" + (error.message || "unknown error"));
      return;
    }
    await loadAll();
  }

  function setKRDraft(objectiveId, patch) {
    setKrDrafts((prev) => ({
      ...prev,
      [objectiveId]: { ...(prev[objectiveId] || {}), ...patch },
    }));
  }

  async function addKR(objectiveId) {
    const draft = krDrafts[objectiveId] || { title: "", target: "", current: "" };
    const title = (draft.title || "").trim();
    const target = safeNumber(draft.target);
    const current = safeNumber(draft.current);

    if (!title) {
      setKRDraft(objectiveId, { error: "请填写 KR 描述" });
      return;
    }
    if (!Number.isFinite(target) || target <= 0) {
      setKRDraft(objectiveId, { error: "目标值必须是 > 0 的数字（例如：26000000）" });
      return;
    }
    if (!Number.isFinite(current) || current < 0) {
      setKRDraft(objectiveId, { error: "当前值必须是 ≥ 0 的数字（空则默认 0）" });
      return;
    }

    const parentO = objectives.find((x) => x.id === objectiveId);

    setKRDraft(objectiveId, { error: "", saving: true });

    const payload = {
      id: crypto.randomUUID(),
      title,
      type: "KR",
      parent_id: objectiveId,
      level: parentO?.level || "company",
      department: parentO?.department || "company",
      target_value: target,
      current_value: current,
      owner_id: session.user.id,
      owner_email: session.user.email,
      owner_name: session.user.email,
    };

    const { error } = await supabase.from("okr_items").insert(payload);
    if (error) {
      setKRDraft(objectiveId, { saving: false, error: "新增 KR 失败：" + (error.message || "unknown") });
      return;
    }

    setKRDraft(objectiveId, { title: "", target: "", current: "", saving: false, error: "" });
    await loadAll();
  }

  async function updateKRCurrent(krId, newCurrentRaw) {
    const n = safeNumber(newCurrentRaw);
    if (!Number.isFinite(n) || n < 0) {
      alert("当前值必须是 ≥ 0 的数字");
      return;
    }
    const ok = await updateItem(krId, { current_value: n });
    if (ok) await loadAll();
  }

  async function updateKRTarget(krId, newTargetRaw) {
    const n = safeNumber(newTargetRaw);
    if (!Number.isFinite(n) || n <= 0) {
      alert("目标值必须是 > 0 的数字");
      return;
    }
    const ok = await updateItem(krId, { target_value: n });
    if (ok) await loadAll();
  }

  async function updateTitle(id, raw) {
    const title = (raw || "").trim();
    if (!title) {
      alert("标题不能为空");
      await loadAll(); // 回滚显示
      return;
    }
    const ok = await updateItem(id, { title });
    if (ok) await loadAll();
  }

  // ---------- Check-in Actions ----------
  function setCheckinDraft(krId, patch) {
    setCheckinDrafts((prev) => ({
      ...prev,
      [krId]: { ...(prev[krId] || {}), ...patch },
    }));
  }

  async function addCheckin(kr) {
    const d = checkinDrafts[kr.id] || { month: "", value: "", note: "" };
    const monthFirstDay = ymToFirstDay(d.month);
    const valueNum = safeNumber(d.value);

    if (!monthFirstDay) {
      setCheckinDraft(kr.id, { error: "请选择月份（例如：2026-01）" });
      return;
    }
    if (!Number.isFinite(valueNum) || valueNum < 0) {
      setCheckinDraft(kr.id, { error: "复盘值必须是 ≥ 0 的数字" });
      return;
    }

    setCheckinDraft(kr.id, { saving: true, error: "" });

    const payload = {
      id: crypto.randomUUID(),
      kr_id: kr.id,
      month: monthFirstDay,
      value: valueNum,
      note: (d.note || "").trim(),
      created_by: session.user.id,
    };

    // ✅ upsert：同月覆盖
    const { error: insErr } = await supabase
      .from("okr_checkins")
      .upsert(payload, { onConflict: "kr_id,month" });

    if (insErr) {
      setCheckinDraft(kr.id, { saving: false, error: "记录失败：" + (insErr.message || "unknown") });
      return;
    }

    // 同步更新当前值
    const ok = await updateItem(kr.id, { current_value: valueNum });
    if (!ok) {
      setCheckinDraft(kr.id, { saving: false, error: "复盘已记，但更新当前值失败" });
      await loadAll();
      return;
    }

    setCheckinDraft(kr.id, { value: "", note: "", saving: false, error: "" });
    await loadAll();
  }

  async function updateCheckin(id, patch) {
    const { error } = await supabase.from("okr_checkins").update(patch).eq("id", id);
    if (error) {
      alert("复盘更新失败：" + (error.message || "unknown error"));
      return false;
    }
    return true;
  }

  async function deleteCheckin(id) {
    if (!confirm("确认删除这条复盘记录？")) return;
    const { error } = await supabase.from("okr_checkins").delete().eq("id", id);
    if (error) return alert("删除失败：" + (error.message || "unknown error"));
    await loadAll();
  }

  // ---------- UI ----------
  if (!session) {
    return (
      <div style={styles.center}>
        <h2 style={{ margin: 0 }}>OKR 系统登录</h2>
        <div style={{ color: "#6b7280", fontSize: 13 }}>邮箱登录（Magic Link）</div>
        <input
          style={styles.input}
          placeholder="输入邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button style={styles.button} onClick={signIn} disabled={authSending}>
          {authSending ? "发送中..." : "发送登录链接"}
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={{ margin: 0 }}>OKR（O → KR）</h2>
        <button style={styles.link} onClick={signOut}>退出</button>
      </div>

      <div style={styles.card}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>新增 Objective</div>
        <input
          style={styles.input}
          placeholder="例如：打造稳定可复制的电商增长引擎，实现高质量盈利"
          value={newOTitle}
          onChange={(e) => setNewOTitle(e.target.value)}
        />
        {newOError ? <div style={styles.error}>{newOError}</div> : null}
        <button style={styles.button} onClick={addObjective} disabled={loading}>
          {loading ? "处理中..." : "新增 O"}
        </button>
      </div>

      {loading ? <div style={{ color: "#6b7280" }}>加载中...</div> : null}

      {objectives.map((o, idx) => {
        const krDraft = krDrafts[o.id] || { title: "", target: "", current: "", error: "", saving: false };

        return (
          <div key={o.id} style={styles.card}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>
                {`O${idx + 1}：`}
                <input
                  style={styles.titleInput}
                  defaultValue={o.title}
                  onBlur={(e) => updateTitle(o.id, e.target.value)}
                />
              </div>
              <button style={styles.danger} onClick={() => deleteItem(o.id, `O${idx + 1}`)}>
                删除 O
              </button>
            </div>

            {/* KR 列表 */}
            {o.krs.length ? (
              <div style={{ marginTop: 12, marginBottom: 12 }}>
                {o.krs.map((k, kIdx) => {
                  const progress = calcProgress(k.current_value, k.target_value);
                  const history = (checkinsByKr[k.id] || []).slice().reverse();
                  const d = checkinDrafts[k.id] || { month: "", value: "", note: "", saving: false, error: "" };

                  return (
                    <div key={k.id} style={styles.krRow}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                        <div style={{ fontWeight: 700 }}>
                          {`KR${kIdx + 1}：`}
                          <input
                            style={styles.titleInput}
                            defaultValue={k.title}
                            onBlur={(e) => updateTitle(k.id, e.target.value)}
                          />
                        </div>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <div style={{ color: "#6b7280", fontSize: 12 }}>{`进度 ${progress}%`}</div>
                          <button style={styles.danger} onClick={() => deleteItem(k.id, `KR${kIdx + 1}`)}>
                            删除 KR
                          </button>
                        </div>
                      </div>

                      <div style={styles.krMeta}>
                        <span>目标：</span>
                        <input
                          style={styles.inlineInput}
                          type="number"
                          defaultValue={k.target_value ?? 0}
                          onBlur={(e) => updateKRTarget(k.id, e.target.value)}
                        />
                        <span style={{ marginLeft: 10 }}>当前：</span>
                        <input
                          style={styles.inlineInput}
                          type="number"
                          defaultValue={k.current_value ?? 0}
                          onBlur={(e) => updateKRCurrent(k.id, e.target.value)}
                        />
                        <span style={{ marginLeft: 8, color: "#6b7280", fontSize: 12 }}>
                          （改完点空白处自动保存）
                        </span>
                      </div>

                      {/* 月度复盘 */}
                      <div style={styles.subCard}>
                        <div style={{ fontWeight: 600, marginBottom: 8 }}>月度复盘（Check-in）</div>

                        <div style={styles.grid3}>
                          <div>
                            <div style={styles.label}>月份</div>
                            <input
                              style={styles.input}
                              type="month"
                              value={d.month}
                              onChange={(e) => setCheckinDraft(k.id, { month: e.target.value })}
                            />
                          </div>
                          <div>
                            <div style={styles.label}>本月实际值</div>
                            <input
                              style={styles.input}
                              type="number"
                              placeholder="例如：5000000"
                              value={d.value}
                              onChange={(e) => setCheckinDraft(k.id, { value: e.target.value })}
                            />
                          </div>
                          <div>
                            <div style={styles.label}>备注（可选）</div>
                            <input
                              style={styles.input}
                              placeholder="例如：本月投放加码，ROI 提升"
                              value={d.note}
                              onChange={(e) => setCheckinDraft(k.id, { note: e.target.value })}
                            />
                          </div>
                        </div>

                        {d.error ? <div style={styles.error}>{d.error}</div> : null}

                        <button style={styles.button} onClick={() => addCheckin(k)} disabled={d.saving}>
                          {d.saving ? "记录中..." : "记录本月复盘"}
                        </button>

                        <div style={{ marginTop: 10, color: "#6b7280", fontSize: 12 }}>
                          历史复盘（可编辑 value / note，失焦保存）：
                        </div>

                        {history.length ? (
                          <div style={{ marginTop: 6, fontSize: 13 }}>
                            {history.map((h) => (
                              <div key={h.id} style={styles.checkinRow}>
                                <b style={{ width: 80, display: "inline-block" }}>
                                  {String(h.month).slice(0, 7)}
                                </b>

                                <span style={{ marginLeft: 8 }}>值：</span>
                                <input
                                  style={styles.inlineInput}
                                  type="number"
                                  defaultValue={h.value}
                                  onBlur={async (e) => {
                                    const n = safeNumber(e.target.value);
                                    if (!Number.isFinite(n) || n < 0) return alert("复盘值必须 ≥ 0");
                                    const ok = await updateCheckin(h.id, { value: n });
                                    if (ok) await loadAll();
                                  }}
                                />

                                <span style={{ marginLeft: 8 }}>备注：</span>
                                <input
                                  style={{ ...styles.inlineInput, width: 260 }}
                                  defaultValue={h.note || ""}
                                  onBlur={async (e) => {
                                    const ok = await updateCheckin(h.id, { note: e.target.value });
                                    if (ok) await loadAll();
                                  }}
                                />

                                <button style={{ ...styles.danger, padding: "6px 10px" }} onClick={() => deleteCheckin(h.id)}>
                                  删除
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ marginTop: 6, fontSize: 13, color: "#6b7280" }}>暂无复盘记录</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: "#6b7280", fontSize: 13, marginTop: 10, marginBottom: 12 }}>
                还没有 KR，建议先拆 2–4 个可量化的关键结果。
              </div>
            )}

            {/* 新增 KR */}
            <div style={styles.subCard}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>新增 KR</div>
              <input
                style={styles.input}
                placeholder="KR 描述（必填）例如：内容电商 GSV ≥ 2600 万"
                value={krDraft.title}
                onChange={(e) => setKRDraft(o.id, { title: e.target.value })}
              />

              <div style={styles.grid2}>
                <div>
                  <div style={styles.label}>目标值（必填）</div>
                  <input
                    style={styles.input}
                    type="number"
                    placeholder="例如：26000000"
                    value={krDraft.target}
                    onChange={(e) => setKRDraft(o.id, { target: e.target.value })}
                  />
                </div>
                <div>
                  <div style={styles.label}>当前值（可选，默认 0）</div>
                  <input
                    style={styles.input}
                    type="number"
                    placeholder="例如：5000000"
                    value={krDraft.current}
                    onChange={(e) => setKRDraft(o.id, { current: e.target.value })}
                  />
                </div>
              </div>

              {krDraft.error ? <div style={styles.error}>{krDraft.error}</div> : null}

              <button style={styles.button} onClick={() => addKR(o.id)} disabled={krDraft.saving}>
                {krDraft.saving ? "新增中..." : "新增 KR"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  center: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  container: {
    maxWidth: 1060,
    margin: "40px auto",
    padding: 16,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  card: {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  subCard: {
    borderTop: "1px dashed #e5e7eb",
    paddingTop: 12,
    marginTop: 10,
  },
  input: {
    width: "100%",
    padding: 10,
    borderRadius: 8,
    border: "1px solid #d1d5db",
    marginBottom: 10,
    outline: "none",
  },
  titleInput: {
    width: 520,
    maxWidth: "80vw",
    padding: "6px 8px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    outline: "none",
    fontWeight: 600,
  },
  inlineInput: {
    width: 140,
    padding: "6px 8px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    outline: "none",
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  grid3: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 2fr",
    gap: 10,
  },
  label: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 6,
  },
  button: {
    padding: "10px 14px",
    background: "#111827",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  },
  link: {
    background: "none",
    border: "none",
    color: "#2563eb",
    cursor: "pointer",
    fontSize: 14,
  },
  danger: {
    padding: "8px 12px",
    background: "#fff",
    color: "#b91c1c",
    border: "1px solid #fecaca",
    borderRadius: 8,
    cursor: "pointer",
  },
  error: {
    color: "#b91c1c",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    padding: "8px 10px",
    borderRadius: 8,
    marginBottom: 10,
    fontSize: 13,
  },
  krRow: {
    border: "1px solid #eef2f7",
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    background: "#fafafa",
  },
  krMeta: {
    marginTop: 8,
    fontSize: 13,
    color: "#374151",
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  checkinRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 0",
    borderBottom: "1px solid #eef2f7",
  },
};
