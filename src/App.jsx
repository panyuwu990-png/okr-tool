import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

/**
 * UX 改进点：
 * 1) 每个 Objective 拥有独立 KR 表单状态（krDrafts[o.id]）
 * 2) 校验失败给出明确提示，不再“无声失败”
 * 3) 提交中按钮禁用 + 文案变化
 * 4) 数值字段做安全 parse（空=0；NaN=提示）
 */

export default function App() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [authSending, setAuthSending] = useState(false);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [newOTitle, setNewOTitle] = useState("");
  const [newOError, setNewOError] = useState("");

  // 每个 O 的 KR 草稿：{ [objectiveId]: { title, target, current, error, saving } }
  const [krDrafts, setKrDrafts] = useState({});

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
    const { data, error } = await supabase
      .from("okr_items")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      alert("加载 OKR 数据失败：" + (error.message || "unknown error"));
      setRows([]);
      setLoading(false);
      return;
    }

    setRows(data || []);
    setLoading(false);

    // 初始化每个 O 的 KR 草稿（避免 undefined）
    const os = (data || []).filter((i) => i.type === "O");
    setKrDrafts((prev) => {
      const next = { ...prev };
      for (const o of os) {
        if (!next[o.id]) {
          next[o.id] = { title: "", target: "", current: "", error: "", saving: false };
        }
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

  // ---------- Helpers ----------
  function safeNumber(input) {
    // 允许空字符串 => 0（对当前值更友好）
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
    return Math.max(0, Math.min(999, p)); // 防止极端值
  }

  // ---------- Actions ----------
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

    // 校验：描述必填，目标值必填且为正数
    if (!title) {
      setKRDraft(objectiveId, { error: "请填写 KR 描述（例如：内容电商 GSV ≥ 2600 万）" });
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

    setKRDraft(objectiveId, { error: "", saving: true });

    const parentO = objectives.find((x) => x.id === objectiveId);

const payload = {
  id: crypto.randomUUID(),
  title,
  type: "KR",
  parent_id: objectiveId,

  // ✅ 关键：补齐数据库 NOT NULL 字段，并继承父 O
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

    // 成功后清空该 O 的草稿
    setKRDraft(objectiveId, { title: "", target: "", current: "", saving: false, error: "" });
    await loadAll();
  }

  // 可选：允许快速更新 KR 当前值（用于月度复盘）
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
        const draft = krDrafts[o.id] || { title: "", target: "", current: "", error: "", saving: false };

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
                  return (
                    <div key={k.id} style={styles.krRow}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ fontWeight: 600 }}>{`KR${kIdx + 1}：${k.title}`}</div>
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
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 12 }}>
                还没有 KR，建议先拆 2–4 个可量化的关键结果。
              </div>
            )}

            {/* KR 新增表单（每个 O 独立） */}
            <div style={styles.subCard}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>新增 KR</div>

              <input
                style={styles.input}
                placeholder="KR 描述（必填）例如：内容电商 GSV ≥ 2600 万"
                value={draft.title}
                onChange={(e) => setKRDraft(o.id, { title: e.target.value })}
              />

              <div style={styles.grid2}>
                <div>
                  <div style={styles.label}>目标值（必填）</div>
                  <input
                    style={styles.input}
                    type="number"
                    placeholder="例如：26000000"
                    value={draft.target}
                    onChange={(e) => setKRDraft(o.id, { target: e.target.value })}
                  />
                </div>
                <div>
                  <div style={styles.label}>当前值（可选，默认 0）</div>
                  <input
                    style={styles.input}
                    type="number"
                    placeholder="例如：5000000"
                    value={draft.current}
                    onChange={(e) => setKRDraft(o.id, { current: e.target.value })}
                  />
                </div>
              </div>

              {draft.error ? <div style={styles.error}>{draft.error}</div> : null}

              <button
                style={styles.button}
                onClick={() => addKR(o.id)}
                disabled={draft.saving}
              >
                {draft.saving ? "新增中..." : "新增 KR"}
              </button>

              <div style={{ marginTop: 8, color: "#6b7280", fontSize: 12 }}>
                小提示：目标值建议填“可度量数字”（如金额、次数、人效%、项目数），便于月度复盘对齐。
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
    maxWidth: 900,
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
    marginTop: 6,
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
    marginBottom: 10,
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
