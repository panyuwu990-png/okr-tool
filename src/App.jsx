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
  const [checkins, setCheckins] = useState([]); // okr_checkins 全量（量不大时最省事）
  const [newOTitle, setNewOTitle] = useState("");
  const [newOError, setNewOError] = useState("");

  // 每个 O 独立的 KR 草稿
  const [krDrafts, setKrDrafts] = useState({});

  // 每个 KR 独立的“月度复盘草稿”
  // { [krId]: { month:'YYYY-MM', value:'', note:'', saving:false, error:'' } }
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
      // 复盘表如果还没建，会在这里报错：提醒你先跑 SQL
      alert("加载 okr_checkins 失败（请确认已创建表）： " + (cksErr.message || "unknown error"));
      setCheckins([]);
    } else {
      setCheckins(cks || []);
    }

    const data = items || [];
    setRows(data);

    // 初始化每个 O 的 KR 草稿
    const os = data.filter((i) => i.type === "O");
    setKrDrafts((prev) => {
      const next = { ...prev };
      for (const o of os) {
        if (!next[o.id]) next[o.id] = { title: "", target: "", current: "", error: "", saving: false };
      }
      return next;
    });

    // 初始化每个 KR 的复盘草稿（默认本月）
    const krs = data.filter((i) => i.type === "KR");
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
    // '2026-01' => '2026-01-01'
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

      // ✅ 继承父 O，避免 NOT NULL 报错
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

  // 直接更新 KR 当前值（你现在已有）
  async function updateKRCurrent(krId, newCurrentRaw) {
    const n = safeNumber(newCurrentRaw);
    if (!Number.isFinite(n) || n < 0) {
      alert("当前值必须是 ≥ 0 的数字");
      return;
    }
    const { error } = await supabase.from("okr_items").update({ current_value: n }).eq("id", krId);
    if (error) return alert("更新失败：" + (error.message || "unknown error"));
    await loadAll();
  }

  // ---------- Check-in Actions（新增） ----------
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

    // 1) 写入复盘记录
    const payload = {
      id: crypto.randomUUID(),
      kr_id: kr.id,
      month: monthFirstDay,
      value: valueNum,
      note: (d.note || "").trim(),
      created_by: session.user.id,
    };

    const { error: insErr } = await supabase.from("okr_checkins").insert(payload);
    if (insErr) {
      setCheckinDraft(kr.id, { saving: false, error: "记录失败：" + (insErr.message || "unknown") });
      return;
    }

    // 2) 同步更新 kr 当前值（让进度实时变化）
    const { error: updErr } = await supabase
      .from("okr_items")
      .update({ current_value: valueNum })
      .eq("id", kr.id);

    if (updErr) {
      // 复盘记录已成功，但 current_value 更新失败
      setCheckinDraft(kr.id, { saving: false, error: "复盘已记，但更新当前值失败：" + (updErr.message || "unknown") });
      await loadAll();
      return;
    }

    // 成功后清空 value/note，保留月份
    setCheckinDraft(kr.id, { value: "", note: "", saving: false, error: "" });
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
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>
              {`O${idx + 1}：${o.title}`}
            </div>

            {/* KR 列表 */}
            {o.krs.length ? (
              <div style={{ marginBottom: 12 }}>
                {o.krs.map((k, kIdx) => {
                  const progress = calcProgress(k.current_value, k.target_value);
                  const history = checkinsByKr[k.id] || [];

                  const d = checkinDrafts[k.id] || { month: "", value: "", note: "", saving: false, error: "" };

                  return (
                    <div key={k.id} style={styles.krRow}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ fontWeight: 700 }}>{`KR${kIdx + 1}：${k.title}`}</div>
                        <div style={{ color: "#6b7280", fontSize: 12 }}>{`进度 ${progress}%`}</div>
                      </div>

                      <div style={styles.krMeta}>
                        <span>目标：{k.target_value ?? "-"}</span>
                        <span style={{ marginLeft: 12 }}>当前：</span>
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

                      {/* ✅ 月度复盘（新增） */}
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

                        <button
                          style={styles.button}
                          onClick={() => addCheckin(k)}
                          disabled={d.saving}
                        >
                          {d.saving ? "记录中..." : "记录本月复盘"}
                        </button>

                        {/* 历史记录 */}
                        <div style={{ marginTop: 10, color: "#6b7280", fontSize: 12 }}>
                          历史复盘（按时间排序）：
                        </div>
                        {history.length ? (
                          <div style={{ marginTop: 6, fontSize: 13 }}>
                            {history.slice().reverse().map((h) => (
                              <div key={h.id} style={{ padding: "4px 0", borderBottom: "1px solid #eef2f7" }}>
                                <b>{String(h.month).slice(0, 7)}</b>：{h.value}
                                {h.note ? <span style={{ color: "#6b7280" }}> · {h.note}</span> : null}
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
              <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 12 }}>
                还没有 KR，建议先拆 2–4 个可量化的关键结果。
              </div>
            )}

            {/* 新增 KR（每个 O 独立） */}
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

              <div style={{ marginTop: 8, color: "#6b7280", fontSize: 12 }}>
                小提示：目标值建议填“可量化数字”（金额、次数、人效%、项目数），便于月度复盘对齐。
              </div>
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
    maxWidth: 980,
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
    marginTop: 6,
    fontSize: 13,
    color: "#374151",
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
};
