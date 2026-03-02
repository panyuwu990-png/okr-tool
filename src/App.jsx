import { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ------------------------- small utils -------------------------
const clampInt = (n, a, b) => Math.max(a, Math.min(b, n));
const ymNow = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const ymToFirstDay = (ym) => (ym && ym.length >= 7 ? `${ym}-01` : null);
const safeNumber = (v, def = 0) => {
  if (v === "" || v === null || v === undefined) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

export default function App() {
  // ------------------------- auth -------------------------
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [authSending, setAuthSending] = useState(false);

  // ------------------------- data -------------------------
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]); // okr_items: O + KR
  const [tasks, setTasks] = useState([]); // okr_tasks
  const [taskCheckins, setTaskCheckins] = useState([]); // okr_task_checkins

  // ------------------------- UI state -------------------------
  const [page, setPage] = useState("list"); // list | tree
  const [editingOId, setEditingOId] = useState(null);

  // new O (collapsed)
  const [showNewO, setShowNewO] = useState(false);
  const [newOTitle, setNewOTitle] = useState("");
  const [newOMainOwner, setNewOMainOwner] = useState("");
  const [newOProgress, setNewOProgress] = useState("0");
  const [newOError, setNewOError] = useState("");

  // new KR drafts (per O)
  const [krDrafts, setKrDrafts] = useState({}); // { [oId]: {title, main_owner, progress, target_value, current_value, error, saving } }

  // new Task drafts (per KR)  ✅ 用独立 draft，避免“输入一个字光标消失”
  const [taskDrafts, setTaskDrafts] = useState({}); // { [krId]: { title, main_owner, progress, error, saving } }

  // modal (task checkin) — by KR
  const [checkinModal, setCheckinModal] = useState(null); // { kr, isEditing, focusTaskId? }

  // task checkin draft (per KR) - record to selected task
  const [taskCheckinDrafts, setTaskCheckinDrafts] = useState({}); // { [krId]: { month, task_id, value, note, saving, error } }

  // menu
  const [menuOpenKey, setMenuOpenKey] = useState(null);
  const menuRootRef = useRef(null);

  // ------------------------- tahoe light background -------------------------
  useEffect(() => {
    const prevBg = document.body.style.background;
    const prevColor = document.body.style.color;
    const prevFont = document.body.style.fontFamily;
    const prevMargin = document.body.style.margin;

    document.body.style.margin = "0";
    document.body.style.fontFamily =
      'ui-sans-serif, system-ui, -apple-system, "SF Pro Display","SF Pro Text", Segoe UI, Roboto, Helvetica, Arial';

    document.body.style.background =
      "radial-gradient(1000px 700px at 15% 10%, rgba(0, 122, 255, 0.10), transparent 60%)," +
      "radial-gradient(900px 600px at 85% 15%, rgba(175, 82, 222, 0.10), transparent 55%)," +
      "radial-gradient(900px 700px at 20% 85%, rgba(52, 199, 89, 0.10), transparent 55%)," +
      "linear-gradient(180deg, #F6F7FB 0%, #F3F5FA 60%, #F6F7FB 100%)";
    document.body.style.color = "#0B1220";

    return () => {
      document.body.style.background = prevBg;
      document.body.style.color = prevColor;
      document.body.style.fontFamily = prevFont;
      document.body.style.margin = prevMargin;
    };
  }, []);

  // click outside menu
  useEffect(() => {
    function onDocClick(e) {
      if (!menuRootRef.current) return;
      if (!menuRootRef.current.contains(e.target)) setMenuOpenKey(null);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // number formatter
  const nf = useMemo(() => new Intl.NumberFormat("zh-CN"), []);
  const formatNumber = (n) => {
    if (n === null || n === undefined || n === "") return "-";
    const num = Number(n);
    if (!Number.isFinite(num)) return String(n);
    return nf.format(num);
  };

  // ------------------------- auth wiring -------------------------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // ------------------------- load data -------------------------
  async function loadAll() {
    setLoading(true);
    const [a, b, c] = await Promise.all([
      supabase.from("okr_items").select("*").order("created_at", { ascending: true }),
      supabase.from("okr_tasks").select("*").order("created_at", { ascending: true }),
      supabase.from("okr_task_checkins").select("*").order("created_at", { ascending: true }),
    ]);
    setLoading(false);

    if (a.error) {
      alert("加载 okr_items 失败：" + (a.error.message || "unknown error"));
      setItems([]);
    } else {
      setItems(a.data || []);
    }

    if (b.error) {
      alert("加载 okr_tasks 失败：" + (b.error.message || "unknown error"));
      setTasks([]);
    } else {
      setTasks(b.data || []);
    }

    if (c.error) {
      alert("加载 okr_task_checkins 失败：" + (c.error.message || "unknown error"));
      setTaskCheckins([]);
    } else {
      setTaskCheckins(c.data || []);
    }

    // init drafts (best-effort)
    setKrDrafts((prev) => {
      const next = { ...prev };
      const os = (a.data || []).filter((x) => x.type === "O");
      for (const o of os) {
        if (!next[o.id]) {
          next[o.id] = {
            title: "",
            main_owner: "",
            progress: "0",
            target_value: "",
            current_value: "",
            error: "",
            saving: false,
          };
        }
      }
      return next;
    });

    setTaskDrafts((prev) => {
      const next = { ...prev };
      const krs = (a.data || []).filter((x) => x.type === "KR");
      for (const kr of krs) {
        if (!next[kr.id]) {
          next[kr.id] = {
            title: "",
            main_owner: "",
            progress: "0",
            error: "",
            saving: false,
          };
        }
      }
      return next;
    });

    setTaskCheckinDrafts((prev) => {
      const next = { ...prev };
      const krs = (a.data || []).filter((x) => x.type === "KR");
      for (const kr of krs) {
        if (!next[kr.id]) {
          next[kr.id] = {
            month: ymNow(),
            task_id: "",
            value: "",
            note: "",
            saving: false,
            error: "",
          };
        }
      }
      return next;
    });
  }

  // ------------------------- derived -------------------------
  const objectives = useMemo(() => {
    const os = items.filter((x) => x.type === "O");
    const krs = items.filter((x) => x.type === "KR");
    return os.map((o) => ({
      ...o,
      krs: krs
        .filter((k) => k.parent_id === o.id)
        .map((k) => ({
          ...k,
          tasks: tasks.filter((t) => t.kr_id === k.id),
        })),
    }));
  }, [items, tasks]);

  const taskCheckinsByTask = useMemo(() => {
    const map = {};
    for (const c of taskCheckins) {
      if (!map[c.task_id]) map[c.task_id] = [];
      map[c.task_id].push(c);
    }
    return map;
  }, [taskCheckins]);

  // ------------------------- helpers -------------------------
  const ownerLabel = (obj) => {
    const a = (obj?.main_owner || "").trim();
    const b = (obj?.owner_name || "").trim();
    const c = (obj?.owner_email || "").trim();
    return a || b || c || "未设置";
  };

  // ------------------------- auth actions -------------------------
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

  // ------------------------- db actions -------------------------
  async function updateItem(id, patch) {
    const { error } = await supabase.from("okr_items").update(patch).eq("id", id);
    if (error) {
      alert("保存失败：" + (error.message || "unknown error"));
      return false;
    }
    return true;
  }

  async function updateTask(id, patch) {
    const { error } = await supabase.from("okr_tasks").update(patch).eq("id", id);
    if (error) {
      alert("保存失败：" + (error.message || "unknown error"));
      return false;
    }
    return true;
  }

  async function deleteItem(id, label) {
    setMenuOpenKey(null);
    if (!confirm(`确认删除：${label}？\n（删除 KR 会连带删除其 Task 与复盘记录）`)) return;
    const { error } = await supabase.from("okr_items").delete().eq("id", id);
    if (error) return alert("删除失败：" + (error.message || "unknown error"));
    if (editingOId === id) setEditingOId(null);
    if (checkinModal?.kr?.id === id) setCheckinModal(null);
    await loadAll();
  }

  async function deleteTask(id, label) {
    setMenuOpenKey(null);
    if (!confirm(`确认删除：${label}？\n（会连带删除该 Task 的复盘记录）`)) return;
    const { error } = await supabase.from("okr_tasks").delete().eq("id", id);
    if (error) return alert("删除失败：" + (error.message || "unknown error"));
    await loadAll();
  }

  // ------------------------- create O / KR / Task -------------------------
  async function addObjective() {
    const title = newOTitle.trim();
    const main_owner = newOMainOwner.trim();
    const progress = clampInt(safeNumber(newOProgress, 0), 0, 100);

    if (!title) {
      setNewOError("请先填写 Objective");
      return;
    }
    setNewOError("");

    const payload = {
      id: crypto.randomUUID(),
      type: "O",
      title,
      parent_id: null,
      progress,
      main_owner: main_owner || null,
      target_value: null,
      current_value: null,
      owner_id: session.user.id,
      owner_email: session.user.email,
      owner_name: session.user.email,
    };

    setLoading(true);
    const { error } = await supabase.from("okr_items").insert(payload);
    setLoading(false);

    if (error) return alert("新增 O 失败：" + (error.message || "unknown error"));

    setNewOTitle("");
    setNewOMainOwner("");
    setNewOProgress("0");
    setShowNewO(false);
    await loadAll();
  }

  function setKRDraft(oId, patch) {
    setKrDrafts((prev) => ({ ...prev, [oId]: { ...(prev[oId] || {}), ...patch } }));
  }

  async function addKR(oId) {
    const d = krDrafts[oId] || {};
    const title = (d.title || "").trim();
    const main_owner = (d.main_owner || "").trim();
    const progress = clampInt(safeNumber(d.progress, 0), 0, 100);

    if (!title) return setKRDraft(oId, { error: "请填写 KR 描述" });

    setKRDraft(oId, { saving: true, error: "" });

    const payload = {
      id: crypto.randomUUID(),
      type: "KR",
      title,
      parent_id: oId,
      progress,
      main_owner: main_owner || null,
      // 这两个字段你可以不用；保留是为了兼容旧 UI
      target_value: d.target_value === "" ? null : safeNumber(d.target_value, 0),
      current_value: d.current_value === "" ? null : safeNumber(d.current_value, 0),
      owner_id: session.user.id,
      owner_email: session.user.email,
      owner_name: session.user.email,
    };

    const { error } = await supabase.from("okr_items").insert(payload);
    if (error) {
      setKRDraft(oId, { saving: false, error: "新增 KR 失败：" + (error.message || "unknown") });
      return;
    }

    setKRDraft(oId, {
      title: "",
      main_owner: "",
      progress: "0",
      target_value: "",
      current_value: "",
      saving: false,
      error: "",
    });

    await loadAll();
  }

  function setTaskDraft(krId, patch) {
    setTaskDrafts((prev) => ({ ...prev, [krId]: { ...(prev[krId] || {}), ...patch } }));
  }

  async function addTask(krId) {
    const d = taskDrafts[krId] || {};
    const title = (d.title || "").trim();
    const main_owner = (d.main_owner || "").trim();
    const progress = clampInt(safeNumber(d.progress, 0), 0, 100);

    if (!title) return setTaskDraft(krId, { error: "请填写 Task 内容" });

    setTaskDraft(krId, { saving: true, error: "" });

    const payload = {
      id: crypto.randomUUID(),
      kr_id: krId,
      title,
      progress,
      main_owner: main_owner || null,
      owner_id: session.user.id,
    };

    const { error } = await supabase.from("okr_tasks").insert(payload);
    if (error) {
      setTaskDraft(krId, { saving: false, error: "新增 Task 失败：" + (error.message || "unknown") });
      return;
    }

    setTaskDraft(krId, { title: "", main_owner: "", progress: "0", saving: false, error: "" });
    await loadAll();
  }

  // ------------------------- edit helpers -------------------------
  async function updateTitle(id, raw) {
    const title = (raw || "").trim();
    if (!title) {
      alert("标题不能为空");
      await loadAll();
      return;
    }
    const ok = await updateItem(id, { title, updated_at: new Date().toISOString() });
    if (ok) await loadAll();
  }

  async function updateMainOwnerItem(id, raw) {
    const main_owner = (raw || "").trim();
    const ok = await updateItem(id, { main_owner: main_owner || null, updated_at: new Date().toISOString() });
    if (ok) await loadAll();
  }

  async function updateProgressItem(id, raw) {
    const p = clampInt(safeNumber(raw, 0), 0, 100);
    const ok = await updateItem(id, { progress: p, updated_at: new Date().toISOString() });
    if (ok) await loadAll();
  }

  async function updateTaskTitle(id, raw) {
    const title = (raw || "").trim();
    if (!title) {
      alert("标题不能为空");
      await loadAll();
      return;
    }
    const ok = await updateTask(id, { title, updated_at: new Date().toISOString() });
    if (ok) await loadAll();
  }

  async function updateTaskOwner(id, raw) {
    const main_owner = (raw || "").trim();
    const ok = await updateTask(id, { main_owner: main_owner || null, updated_at: new Date().toISOString() });
    if (ok) await loadAll();
  }

  async function updateTaskProgress(id, raw) {
    const p = clampInt(safeNumber(raw, 0), 0, 100);
    const ok = await updateTask(id, { progress: p, updated_at: new Date().toISOString() });
    if (ok) await loadAll();
  }

  // ------------------------- task check-in -------------------------
  function setTaskCheckinDraft(krId, patch) {
    setTaskCheckinDrafts((prev) => ({ ...prev, [krId]: { ...(prev[krId] || {}), ...patch } }));
  }

  async function upsertTaskCheckin(kr, isEditing) {
    const d = taskCheckinDrafts[kr.id] || {};
    const monthFirstDay = ymToFirstDay(d.month);
    const value = safeNumber(d.value, 0);

    if (!monthFirstDay) return setTaskCheckinDraft(kr.id, { error: "请选择月份" });
    if (!d.task_id) return setTaskCheckinDraft(kr.id, { error: "请选择一个 Task" });
    if (!Number.isFinite(value) || value < 0) return setTaskCheckinDraft(kr.id, { error: "复盘值必须是 ≥ 0 的数字" });

    if (!isEditing) return setTaskCheckinDraft(kr.id, { error: "只读模式：请先在 O 右上角点击「修改」进入编辑模式。" });

    setTaskCheckinDraft(kr.id, { saving: true, error: "" });

    const payload = {
      id: crypto.randomUUID(),
      task_id: d.task_id,
      month: monthFirstDay,
      value,
      note: (d.note || "").trim(),
      created_by: session.user.id,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("okr_task_checkins").upsert(payload, { onConflict: "task_id,month" });
    if (error) {
      setTaskCheckinDraft(kr.id, { saving: false, error: "记录失败：" + (error.message || "unknown") });
      return;
    }

    setTaskCheckinDraft(kr.id, { value: "", note: "", saving: false, error: "" });
    await loadAll();
  }

  async function updateTaskCheckin(id, patch) {
    const { error } = await supabase.from("okr_task_checkins").update(patch).eq("id", id);
    if (error) {
      alert("复盘更新失败：" + (error.message || "unknown error"));
      return false;
    }
    return true;
  }

  async function deleteTaskCheckin(id) {
    setMenuOpenKey(null);
    if (!confirm("确认删除这条复盘记录？")) return;
    const { error } = await supabase.from("okr_task_checkins").delete().eq("id", id);
    if (error) return alert("删除失败：" + (error.message || "unknown error"));
    await loadAll();
  }

  // ------------------------- UI components -------------------------
  function Chip({ children, tone = "gray" }) {
    const t =
      tone === "blue"
        ? styles.chipBlue
        : tone === "green"
        ? styles.chipGreen
        : tone === "violet"
        ? styles.chipViolet
        : styles.chipGray;
    return <span style={{ ...styles.chip, ...t }}>{children}</span>;
  }

  function Button({ children, onClick, disabled, variant = "primary", title }) {
    const s =
      variant === "ghost"
        ? styles.btnGhost
        : variant === "soft"
        ? styles.btnSoft
        : styles.btnPrimary;
    return (
      <button
        title={title}
        style={{
          ...styles.btnBase,
          ...s,
          opacity: disabled ? 0.55 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        onClick={disabled ? undefined : onClick}
      >
        {children}
      </button>
    );
  }

  function ProgressBar({ value }) {
    const v = clampInt(safeNumber(value, 0), 0, 100);
    return (
      <div style={styles.progressTrack} aria-label={`progress ${v}%`}>
        <div style={{ ...styles.progressFill, width: `${v}%` }} />
      </div>
    );
  }

  function MoreMenu({ menuKey, items }) {
    const isOpen = menuOpenKey === menuKey;
    return (
      <div style={{ position: "relative" }}>
        <button style={styles.iconBtn} onClick={() => setMenuOpenKey(isOpen ? null : menuKey)} title="更多">
          ···
        </button>
        {isOpen ? (
          <div style={styles.menu}>
            {items.map((it) => (
              <button
                key={it.label}
                style={it.danger ? styles.menuItemDanger : styles.menuItem}
                onClick={it.onClick}
              >
                {it.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  function Modal({ title, open, onClose, children }) {
    useEffect(() => {
      function onKey(e) {
        if (e.key === "Escape") onClose?.();
      }
      if (open) document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
      <div style={styles.modalMask} onMouseDown={onClose}>
        <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
          <div style={styles.modalHeader}>
            <div style={styles.modalTitle}>{title}</div>
            <Button variant="ghost" onClick={onClose} title="关闭">
              ✕
            </Button>
          </div>
          <div style={styles.modalBody}>{children}</div>
        </div>
      </div>
    );
  }

  // ------------------------- Task Checkin Panel (by KR) -------------------------
  function TaskCheckinPanel({ kr, isEditing, focusTaskId }) {
    const krTasks = tasks.filter((t) => t.kr_id === kr.id);
    const d = taskCheckinDrafts[kr.id] || {
      month: ymNow(),
      task_id: "",
      value: "",
      note: "",
      saving: false,
      error: "",
    };

    // keep selection stable
    useEffect(() => {
      if (!krTasks.length) return;
      if (!d.task_id) {
        setTaskCheckinDraft(kr.id, { task_id: focusTaskId || krTasks[0].id });
      } else if (!krTasks.some((x) => x.id === d.task_id)) {
        setTaskCheckinDraft(kr.id, { task_id: focusTaskId || krTasks[0].id });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [kr.id, krTasks.length, focusTaskId]);

    return (
      <div>
        <div style={styles.subPanel}>
          <div style={styles.sectionTitle}>按 Task 录入本月复盘</div>
          <div style={{ marginTop: 10, ...styles.grid4 }}>
            <div>
              <div style={styles.label}>月份</div>
              <input
                style={styles.input}
                type="month"
                value={d.month}
                onChange={(e) => setTaskCheckinDraft(kr.id, { month: e.target.value })}
                disabled={!isEditing}
              />
            </div>

            <div>
              <div style={styles.label}>Task</div>
              <select
                style={styles.input}
                value={d.task_id}
                onChange={(e) => setTaskCheckinDraft(kr.id, { task_id: e.target.value })}
                disabled={!isEditing}
              >
                {krTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={styles.label}>本月实际值</div>
              <input
                style={styles.input}
                type="number"
                placeholder="例如：5000000"
                value={d.value}
                onChange={(e) => setTaskCheckinDraft(kr.id, { value: e.target.value })}
                disabled={!isEditing}
              />
            </div>

            <div>
              <div style={styles.label}>备注（可选）</div>
              <input
                style={styles.input}
                placeholder="例如：本月投放加码，ROI 提升"
                value={d.note}
                onChange={(e) => setTaskCheckinDraft(kr.id, { note: e.target.value })}
                disabled={!isEditing}
              />
            </div>
          </div>

          {d.error ? <div style={styles.toastErr}>{d.error}</div> : null}

          <Button onClick={() => upsertTaskCheckin(kr, isEditing)} disabled={d.saving || !krTasks.length}>
            {d.saving ? "记录中..." : "记录本月复盘"}
          </Button>

          {!krTasks.length ? <div style={{ marginTop: 10, ...styles.muted }}>该 KR 还没有 Task，请先新增 Task。</div> : null}
          {!isEditing ? (
            <div style={{ marginTop: 10, ...styles.muted }}>
              只读模式：如需录入/编辑复盘，请先在该 O 右上角点击「修改」进入编辑模式。
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={styles.sectionTitle}>历史复盘（按 Task 展开）</div>

          {krTasks.length ? (
            <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
              {krTasks.map((t) => {
                const history = (taskCheckinsByTask[t.id] || []).slice().sort((x, y) => String(y.month).localeCompare(String(x.month)));
                return (
                  <div key={t.id} style={styles.taskHistoryCard}>
                    <div style={styles.taskHistoryHeader}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <Chip tone="blue">Task</Chip>
                          <div style={{ fontWeight: 900, color: "#0B1220", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {t.title}
                          </div>
                        </div>
                        <div style={{ marginTop: 6, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <Chip tone="gray">负责人：{ownerLabel(t)}</Chip>
                          <Chip tone="violet">进度 {clampInt(safeNumber(t.progress, 0), 0, 100)}%</Chip>
                        </div>
                      </div>
                    </div>

                    {history.length ? (
                      <div style={{ marginTop: 8 }}>
                        {history.map((h) => (
                          <div key={h.id} style={styles.checkinRow}>
                            <div style={{ width: 92 }}>
                              <Chip tone="violet">{String(h.month).slice(0, 7)}</Chip>
                            </div>

                            {!isEditing ? (
                              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                                <div>
                                  <span style={styles.muted}>值：</span>
                                  <b>{formatNumber(h.value)}</b>
                                </div>
                                {h.note ? (
                                  <div style={{ maxWidth: 640 }}>
                                    <span style={styles.muted}>备注：</span>
                                    <span>{h.note}</span>
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                <span style={styles.muted}>值：</span>
                                <input
                                  style={styles.inlineInput}
                                  type="number"
                                  defaultValue={h.value}
                                  onBlur={async (e) => {
                                    const n = safeNumber(e.target.value, 0);
                                    if (!Number.isFinite(n) || n < 0) return alert("复盘值必须 ≥ 0");
                                    const ok = await updateTaskCheckin(h.id, { value: n, updated_at: new Date().toISOString() });
                                    if (ok) await loadAll();
                                  }}
                                />

                                <span style={styles.muted}>备注：</span>
                                <input
                                  style={{ ...styles.inlineInput, width: 360 }}
                                  defaultValue={h.note || ""}
                                  onBlur={async (e) => {
                                    const ok = await updateTaskCheckin(h.id, { note: e.target.value, updated_at: new Date().toISOString() });
                                    if (ok) await loadAll();
                                  }}
                                />

                                <MoreMenu
                                  menuKey={`tck:${h.id}`}
                                  items={[{ label: "删除复盘", danger: true, onClick: () => deleteTaskCheckin(h.id) }]}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ marginTop: 10, ...styles.muted }}>暂无复盘记录</div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ marginTop: 10, ...styles.muted }}>暂无 Task</div>
          )}
        </div>
      </div>
    );
  }

  // ------------------------- Tree View (Root -> O -> KR -> Task) -------------------------
  function TreeView({ objectives }) {
    const wrapRef = useRef(null);
    const contentRef = useRef(null);
    const [lines, setLines] = useState([]);
    const nodeRefs = useRef(new Map());
    const [scale, setScale] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const root = useMemo(() => ({ id: "root", title: "年度 OKR", type: "ROOT", main_owner: "公司" }), []);

    function setRef(key, el) {
      if (!key) return;
      if (el) nodeRefs.current.set(key, el);
      else nodeRefs.current.delete(key);
    }

    function calcPos(el) {
      const r = el.getBoundingClientRect();
      const cr = contentRef.current.getBoundingClientRect();
      return {
        x: r.left - cr.left + r.width / 2,
        top: r.top - cr.top,
        bottom: r.bottom - cr.top,
      };
    }

    function recomputeLines() {
      if (!contentRef.current) return;
      const newLines = [];

      const rootEl = nodeRefs.current.get("root");
      if (!rootEl) return;

      for (const o of objectives) {
        const oEl = nodeRefs.current.get(`o:${o.id}`);
        if (!oEl) continue;
        const a = calcPos(rootEl);
        const b = calcPos(oEl);
        newLines.push({ x1: a.x, y1: a.bottom, x2: b.x, y2: b.top });

        for (const kr of o.krs) {
          const krEl = nodeRefs.current.get(`kr:${kr.id}`);
          if (!krEl) continue;
          const c = calcPos(oEl);
          const d = calcPos(krEl);
          newLines.push({ x1: c.x, y1: c.bottom, x2: d.x, y2: d.top });

          for (const t of kr.tasks || []) {
            const tEl = nodeRefs.current.get(`t:${t.id}`);
            if (!tEl) continue;
            const e = calcPos(krEl);
            const f = calcPos(tEl);
            newLines.push({ x1: e.x, y1: e.bottom, x2: f.x, y2: f.top });
          }
        }
      }

      setLines(newLines);
    }

    useLayoutEffect(() => {
      recomputeLines();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [objectives, scale, tasks.length]);

    useEffect(() => {
      function onResize() {
        recomputeLines();
      }
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scale]);

    useEffect(() => {
      const el = wrapRef.current;
      if (!el) return;

      function onWheel(e) {
        const isZoomGesture = e.ctrlKey || e.metaKey;
        if (!isZoomGesture) return;
        e.preventDefault();
        setScale((s) => clampInt(Math.round((s + (e.deltaY > 0 ? -0.08 : 0.08)) * 100), 55, 200) / 100);
      }

      el.addEventListener("wheel", onWheel, { passive: false });
      return () => el.removeEventListener("wheel", onWheel);
    }, []);

    useEffect(() => {
      function onFsChange() {
        setIsFullscreen(!!document.fullscreenElement);
        setTimeout(() => recomputeLines(), 50);
      }
      document.addEventListener("fullscreenchange", onFsChange);
      return () => document.removeEventListener("fullscreenchange", onFsChange);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function zoomIn() {
      setScale((s) => Math.min(2.0, Math.round((s + 0.1) * 100) / 100));
    }
    function zoomOut() {
      setScale((s) => Math.max(0.55, Math.round((s - 0.1) * 100) / 100));
    }
    function resetZoom() {
      setScale(1);
    }
    function fitZoom() {
      const wrap = wrapRef.current;
      const content = contentRef.current;
      if (!wrap || !content) return;

      setScale(1);
      requestAnimationFrame(() => {
        const wr = wrap.getBoundingClientRect();
        const cr = content.getBoundingClientRect();
        const padding = 56;
        const availW = wr.width - padding;
        const availH = wr.height - padding;
        const ratioW = availW / cr.width;
        const ratioH = availH / cr.height;
        const next = Math.max(0.55, Math.min(2.0, Math.round(Math.min(ratioW, ratioH) * 100) / 100));
        setScale(next);
        requestAnimationFrame(() => wrap.scrollTo({ top: 0, left: 0, behavior: "smooth" }));
      });
    }
    async function toggleFullscreen() {
      const el = wrapRef.current;
      if (!el) return;
      if (!document.fullscreenElement) {
        try {
          await el.requestFullscreen();
        } catch {
          alert("进入全屏失败（浏览器可能限制）");
        }
      } else {
        await document.exitFullscreen();
      }
    }

    return (
      <div style={styles.panel}>
        <div style={styles.treeTopBar}>
          <div>
            <div style={styles.h3}>关系树</div>
            <div style={styles.muted}>Ctrl/⌘ + 滚轮缩放；点击 Task 可打开 KR 的复盘弹窗</div>
          </div>

          <div style={styles.zoomBar}>
            <Button variant="soft" onClick={zoomOut}>
              －
            </Button>
            <Chip tone="blue">{Math.round(scale * 100)}%</Chip>
            <Button variant="soft" onClick={zoomIn}>
              ＋
            </Button>
            <Button variant="ghost" onClick={fitZoom}>
              适配
            </Button>
            <Button variant="ghost" onClick={resetZoom}>
              重置
            </Button>
            <Button variant={isFullscreen ? "soft" : "primary"} onClick={toggleFullscreen}>
              {isFullscreen ? "退出全屏" : "全屏"}
            </Button>
          </div>
        </div>

        <div ref={wrapRef} style={isFullscreen ? styles.treeWrapFullscreen : styles.treeWrap}>
          <div
            ref={contentRef}
            style={{
              position: "relative",
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              width: "max-content",
              padding: 22,
            }}
          >
            <svg style={styles.treeSvg}>
              {lines.map((ln, i) => (
                <line
                  key={i}
                  x1={ln.x1}
                  y1={ln.y1}
                  x2={ln.x2}
                  y2={ln.y2}
                  stroke="rgba(35, 46, 65, 0.18)"
                  strokeWidth="2"
                />
              ))}
            </svg>

            {/* Root */}
            <div style={styles.treeLevel}>
              <div ref={(el) => setRef("root", el)} style={{ ...styles.nodeCard, ...styles.nodeRoot }}>
                <div style={styles.nodeTitle}>
                  <span style={styles.nodeGlyph}>◎</span>
                  {root.title}
                </div>
                <div style={styles.nodeSubSmall}>负责人：{ownerLabel(root)}</div>
                <div style={styles.nodeMeta}>
                  <span style={styles.nodeMetaLeft}>类型：公司</span>
                  <span style={styles.nodeProgress}>—</span>
                </div>
                <ProgressBar value={0} />
              </div>
            </div>

            {/* O level */}
            <div style={{ ...styles.treeLevel, marginTop: 20 }}>
              <div style={styles.treeRow}>
                {objectives.map((o, idx) => (
                  <div key={o.id} ref={(el) => setRef(`o:${o.id}`, el)} style={styles.nodeCard} title={o.title}>
                    <div style={styles.nodeTitle}>
                      <span style={styles.nodeGlyph}>O</span>
                      {`O${idx + 1}`}
                    </div>
                    <div style={styles.nodeSub}>{o.title}</div>
                    <div style={styles.nodeSubSmall}>负责人：{ownerLabel(o)}</div>
                    <div style={styles.nodeMeta}>
                      <span style={styles.nodeMetaLeft}>进度（手填）</span>
                      <span style={styles.nodeProgress}>{clampInt(safeNumber(o.progress, 0), 0, 100)}%</span>
                    </div>
                    <ProgressBar value={clampInt(safeNumber(o.progress, 0), 0, 100)} />
                  </div>
                ))}
              </div>
            </div>

            {/* KR + Task level (columns per O) */}
            <div style={{ ...styles.treeLevel, marginTop: 20 }}>
              <div style={styles.treeRow}>
                {objectives.map((o) => (
                  <div key={o.id} style={styles.krCol}>
                    {(o.krs || []).map((k, kIdx) => (
                      <div key={k.id} style={{ display: "grid", gap: 10 }}>
                        <div ref={(el) => setRef(`kr:${k.id}`, el)} style={styles.nodeCard} title={k.title}>
                          <div style={styles.nodeTitle}>
                            <span style={styles.nodeGlyph}>K</span>
                            {`KR${kIdx + 1}`}
                          </div>
                          <div style={styles.nodeSub}>{k.title}</div>
                          <div style={styles.nodeSubSmall}>负责人：{ownerLabel(k)}</div>
                          <div style={styles.nodeMeta}>
                            <span style={styles.nodeMetaLeft}>进度（手填）</span>
                            <span style={styles.nodeProgress}>{clampInt(safeNumber(k.progress, 0), 0, 100)}%</span>
                          </div>
                          <ProgressBar value={clampInt(safeNumber(k.progress, 0), 0, 100)} />
                        </div>

                        {/* tasks under this KR */}
                        <div style={{ display: "grid", gap: 10, paddingLeft: 10 }}>
                          {(k.tasks || []).map((t) => (
                            <div
                              key={t.id}
                              ref={(el) => setRef(`t:${t.id}`, el)}
                              style={{ ...styles.nodeCard, width: 250, cursor: "pointer" }}
                              onClick={() => setCheckinModal({ kr: k, isEditing: false, focusTaskId: t.id })}
                              title="点击打开复盘"
                            >
                              <div style={styles.nodeTitle}>
                                <span style={styles.nodeGlyph}>T</span>
                                Task
                              </div>
                              <div style={styles.nodeSub}>{t.title}</div>
                              <div style={styles.nodeSubSmall}>负责人：{ownerLabel(t)}</div>
                              <div style={styles.nodeMeta}>
                                <span style={styles.nodeMetaLeft}>进度（手填）</span>
                                <span style={styles.nodeProgress}>{clampInt(safeNumber(t.progress, 0), 0, 100)}%</span>
                              </div>
                              <ProgressBar value={clampInt(safeNumber(t.progress, 0), 0, 100)} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ------------------------- auth page -------------------------
  if (!session) {
    return (
      <div style={styles.center}>
        <div style={styles.loginCard}>
          <div style={styles.brandRow}>
            <div style={styles.brandMark} />
            <div>
              <div style={styles.brandTitle}>OKR Nexus</div>
              <div style={styles.brandSub}>轻量 · 专注 · Tahoe 风格</div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={styles.h3}>登录</div>
            <div style={styles.muted}>邮箱登录（Magic Link）</div>
          </div>

          <input style={styles.input} placeholder="输入邮箱" value={email} onChange={(e) => setEmail(e.target.value)} />

          <Button onClick={signIn} disabled={authSending}>
            {authSending ? "发送中..." : "发送登录链接"}
          </Button>

          <div style={{ marginTop: 12, ...styles.muted }}>* 若没收到邮件，请检查垃圾箱或稍后重试</div>
        </div>
      </div>
    );
  }

  // ------------------------- main -------------------------
  return (
    <div style={styles.container} ref={menuRootRef}>
      {/* Top Nav */}
      <div style={styles.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={styles.logoOrb} />
          <div>
            <div style={styles.appTitle}>OKR Nexus</div>
            <div style={styles.appSub}>O → KR → Task · 复盘按 Task</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={styles.tabs}>
            <button style={page === "list" ? styles.tabActive : styles.tab} onClick={() => setPage("list")}>
              列表
            </button>
            <button style={page === "tree" ? styles.tabActive : styles.tab} onClick={() => setPage("tree")}>
              关系树
            </button>
          </div>

          <Button variant="ghost" onClick={signOut}>
            退出
          </Button>
        </div>
      </div>

      {/* Tree page */}
      {page === "tree" ? (
        <TreeView objectives={objectives} />
      ) : (
        <>
          {/* New Objective (Collapsed) */}
          <div style={styles.panel}>
            <div style={styles.panelHeaderRow}>
              <div>
                <div style={styles.h3}>Objective</div>
                <div style={styles.muted}>建议：一条 O 配若干 KR；KR 下拆 Task，复盘按 Task 录入</div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {loading ? <Chip tone="violet">同步中</Chip> : <Chip tone="gray">在线</Chip>}
                <Button variant={showNewO ? "soft" : "primary"} onClick={() => setShowNewO((v) => !v)}>
                  {showNewO ? "收起" : "＋ 新建 Objective"}
                </Button>
              </div>
            </div>

            {showNewO ? (
              <div style={{ marginTop: 12 }}>
                <div style={styles.formRow}>
                  <div style={{ flex: 2 }}>
                    <div style={styles.label}>Objective</div>
                    <input
                      style={styles.input}
                      placeholder="例如：打造稳定可复制的电商增长引擎，实现高质量盈利"
                      value={newOTitle}
                      onChange={(e) => setNewOTitle(e.target.value)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={styles.label}>主要负责人</div>
                    <input
                      style={styles.input}
                      placeholder="例如：张三"
                      value={newOMainOwner}
                      onChange={(e) => setNewOMainOwner(e.target.value)}
                    />
                  </div>
                  <div style={{ width: 160 }}>
                    <div style={styles.label}>进度（手填 0-100）</div>
                    <input
                      style={styles.input}
                      type="number"
                      value={newOProgress}
                      onChange={(e) => setNewOProgress(e.target.value)}
                    />
                  </div>
                </div>

                {newOError ? <div style={styles.toastErr}>{newOError}</div> : null}

                <Button onClick={addObjective} disabled={loading}>
                  {loading ? "处理中..." : "创建 Objective"}
                </Button>
              </div>
            ) : null}
          </div>

          {/* Objectives list */}
          {objectives.map((o, idx) => {
            const isEditing = editingOId === o.id;
            const krDraft = krDrafts[o.id] || {
              title: "",
              main_owner: "",
              progress: "0",
              target_value: "",
              current_value: "",
              error: "",
              saving: false,
            };

            return (
              <div key={o.id} style={styles.panel}>
                {/* O header */}
                <div style={styles.oHeader}>
                  <div style={{ minWidth: 0 }}>
                    <div style={styles.oTitleRow}>
                      <span style={styles.oIndex}>{`O${idx + 1}`}</span>
                      {isEditing ? (
                        <input
                          style={styles.titleInput}
                          defaultValue={o.title}
                          onBlur={(e) => updateTitle(o.id, e.target.value)}
                        />
                      ) : (
                        <span style={styles.oTitleText}>{o.title}</span>
                      )}
                    </div>

                    <div style={styles.oMetaRow}>
                      <Chip tone="gray">负责人：{ownerLabel(o)}</Chip>
                      <Chip tone="violet">进度 {clampInt(safeNumber(o.progress, 0), 0, 100)}%</Chip>
                    </div>

                    {isEditing ? (
                      <div style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ width: 280 }}>
                          <div style={styles.label}>主要负责人（可修改）</div>
                          <input
                            style={styles.input}
                            defaultValue={o.main_owner || ""}
                            placeholder="例如：张三"
                            onBlur={(e) => updateMainOwnerItem(o.id, e.target.value)}
                          />
                        </div>
                        <div style={{ width: 200 }}>
                          <div style={styles.label}>进度（手填 0-100）</div>
                          <input
                            style={styles.input}
                            type="number"
                            defaultValue={o.progress ?? 0}
                            onBlur={(e) => updateProgressItem(o.id, e.target.value)}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <Button
                      variant={isEditing ? "soft" : "primary"}
                      onClick={() => {
                        setMenuOpenKey(null);
                        setEditingOId(isEditing ? null : o.id);
                        if (isEditing && checkinModal) {
                          setCheckinModal({ ...checkinModal, isEditing: false });
                        }
                      }}
                    >
                      {isEditing ? "完成" : "修改"}
                    </Button>

                    {isEditing ? (
                      <MoreMenu
                        menuKey={`o:${o.id}`}
                        items={[
                          {
                            label: "删除 O",
                            danger: true,
                            onClick: () => deleteItem(o.id, `O${idx + 1}`),
                          },
                        ]}
                      />
                    ) : null}
                  </div>
                </div>

                {/* KR list */}
                <div style={{ marginTop: 12 }}>
                  <div style={styles.sectionTitle}>KR</div>

                  {o.krs.length ? (
                    <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
                      {o.krs.map((k, kIdx) => {
                        const krProgress = clampInt(safeNumber(k.progress, 0), 0, 100);
                        const taskList = k.tasks || [];
                        const tDraft = taskDrafts[k.id] || { title: "", main_owner: "", progress: "0", error: "", saving: false };

                        return (
                          <div key={k.id} style={styles.krBlock}>
                            {/* KR row */}
                            <div style={styles.krCompactRow}>
                              <div style={styles.krLeft}>
                                <span style={styles.krBadge}>{`KR${kIdx + 1}`}</span>
                                <div style={{ minWidth: 0 }}>
                                  {isEditing ? (
                                    <input
                                      style={styles.krTitleInput}
                                      defaultValue={k.title}
                                      onBlur={(e) => updateTitle(k.id, e.target.value)}
                                    />
                                  ) : (
                                    <div style={styles.krTitleText} title={k.title}>
                                      {k.title}
                                    </div>
                                  )}

                                  <div style={styles.krSubLine}>
                                    <span style={styles.krSubLabel}>负责人：</span>
                                    {isEditing ? (
                                      <input
                                        style={styles.krMiniInput}
                                        defaultValue={k.main_owner || ""}
                                        placeholder="姓名"
                                        onBlur={(e) => updateMainOwnerItem(k.id, e.target.value)}
                                      />
                                    ) : (
                                      <span style={styles.krSubValue}>{ownerLabel(k)}</span>
                                    )}

                                    <span style={{ ...styles.krSubLabel, marginLeft: 10 }}>进度：</span>
                                    {isEditing ? (
                                      <input
                                        style={{ ...styles.krMiniInput, width: 86 }}
                                        type="number"
                                        defaultValue={k.progress ?? 0}
                                        onBlur={(e) => updateProgressItem(k.id, e.target.value)}
                                      />
                                    ) : (
                                      <span style={styles.krSubValue}>{krProgress}%</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div style={styles.krRight}>
                                <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 180 }}>
                                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                    <Chip tone={krProgress >= 80 ? "green" : krProgress >= 40 ? "blue" : "violet"}>
                                      进度 {krProgress}%
                                    </Chip>
                                  </div>
                                  <ProgressBar value={krProgress} />
                                </div>

                                <Button
                                  variant="ghost"
                                  onClick={() => {
                                    setMenuOpenKey(null);
                                    setCheckinModal({ kr: k, isEditing, focusTaskId: null });
                                  }}
                                >
                                  复盘
                                </Button>

                                {isEditing ? (
                                  <MoreMenu
                                    menuKey={`kr:${k.id}`}
                                    items={[
                                      { label: "删除 KR", danger: true, onClick: () => deleteItem(k.id, `KR${kIdx + 1}`) },
                                    ]}
                                  />
                                ) : null}
                              </div>
                            </div>

                            {/* Tasks under KR */}
                            <div style={{ marginTop: 10 }}>
                              <div style={styles.sectionTitle}>Tasks</div>

                              {taskList.length ? (
                                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                                  {taskList.map((t, tIdx) => {
                                    const tp = clampInt(safeNumber(t.progress, 0), 0, 100);
                                    return (
                                      <div key={t.id} style={styles.taskRow}>
                                        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0, flex: 1 }}>
                                          <span style={styles.taskBadge}>{`T${tIdx + 1}`}</span>
                                          <div style={{ minWidth: 0, flex: 1 }}>
                                            {isEditing ? (
                                              <input
                                                style={styles.taskTitleInput}
                                                defaultValue={t.title}
                                                onBlur={(e) => updateTaskTitle(t.id, e.target.value)}
                                              />
                                            ) : (
                                              <div style={styles.taskTitleText} title={t.title}>
                                                {t.title}
                                              </div>
                                            )}

                                            <div style={styles.taskSub}>
                                              <span style={styles.krSubLabel}>负责人：</span>
                                              {isEditing ? (
                                                <input
                                                  style={styles.krMiniInput}
                                                  defaultValue={t.main_owner || ""}
                                                  placeholder="姓名"
                                                  onBlur={(e) => updateTaskOwner(t.id, e.target.value)}
                                                />
                                              ) : (
                                                <span style={styles.krSubValue}>{ownerLabel(t)}</span>
                                              )}

                                              <span style={{ ...styles.krSubLabel, marginLeft: 10 }}>进度：</span>
                                              {isEditing ? (
                                                <input
                                                  style={{ ...styles.krMiniInput, width: 86 }}
                                                  type="number"
                                                  defaultValue={t.progress ?? 0}
                                                  onBlur={(e) => updateTaskProgress(t.id, e.target.value)}
                                                />
                                              ) : (
                                                <span style={styles.krSubValue}>{tp}%</span>
                                              )}
                                            </div>
                                          </div>
                                        </div>

                                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                                          <div style={{ minWidth: 180 }}>
                                            <ProgressBar value={tp} />
                                          </div>

                                          <Button
                                            variant="ghost"
                                            onClick={() => {
                                              setMenuOpenKey(null);
                                              setCheckinModal({ kr: k, isEditing, focusTaskId: t.id });
                                            }}
                                          >
                                            复盘
                                          </Button>

                                          {isEditing ? (
                                            <MoreMenu
                                              menuKey={`t:${t.id}`}
                                              items={[
                                                { label: "删除 Task", danger: true, onClick: () => deleteTask(t.id, `Task：${t.title}`) },
                                              ]}
                                            />
                                          ) : null}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div style={{ marginTop: 10, ...styles.muted }}>还没有 Task（建议把 KR 拆成可执行任务）</div>
                              )}
                            </div>

                            {/* Add Task (only in edit mode) */}
                            {isEditing ? (
                              <div style={{ marginTop: 12, ...styles.subPanel }}>
                                <div style={styles.sectionTitle}>新增 Task</div>

                                <div style={{ marginTop: 10 }}>
                                  <div style={styles.formRow}>
                                    <div style={{ flex: 2 }}>
                                      <div style={styles.label}>Task 内容</div>
                                      {/* ✅ controlled input：只更新 taskDrafts，不触发 reload，不会丢光标 */}
                                      <input
                                        style={styles.input}
                                        placeholder="例如：完成渠道 SOP、上线广告投放、优化转化链路…"
                                        value={tDraft.title}
                                        onChange={(e) => setTaskDraft(k.id, { title: e.target.value })}
                                      />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      <div style={styles.label}>主要负责人</div>
                                      <input
                                        style={styles.input}
                                        placeholder="例如：李四"
                                        value={tDraft.main_owner}
                                        onChange={(e) => setTaskDraft(k.id, { main_owner: e.target.value })}
                                      />
                                    </div>
                                    <div style={{ width: 160 }}>
                                      <div style={styles.label}>进度（手填 0-100）</div>
                                      <input
                                        style={styles.input}
                                        type="number"
                                        value={tDraft.progress}
                                        onChange={(e) => setTaskDraft(k.id, { progress: e.target.value })}
                                      />
                                    </div>
                                  </div>

                                  {tDraft.error ? <div style={styles.toastErr}>{tDraft.error}</div> : null}

                                  <Button onClick={() => addTask(k.id)} disabled={tDraft.saving}>
                                    {tDraft.saving ? "新增中..." : "新增 Task"}
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ marginTop: 10, ...styles.muted }}>还没有 KR（建议先拆若干 KR）</div>
                  )}
                </div>

                {/* Add KR (only in edit mode) */}
                {isEditing ? (
                  <div style={{ marginTop: 14, ...styles.subPanel }}>
                    <div style={styles.sectionTitle}>新增 KR</div>

                    <div style={{ marginTop: 10 }}>
                      <div style={styles.formRow}>
                        <div style={{ flex: 2 }}>
                          <div style={styles.label}>KR 描述</div>
                          <input
                            style={styles.input}
                            placeholder="例如：内容电商 GSV ≥ 2600 万"
                            value={krDraft.title}
                            onChange={(e) => setKRDraft(o.id, { title: e.target.value })}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={styles.label}>主要负责人</div>
                          <input
                            style={styles.input}
                            placeholder="例如：李四"
                            value={krDraft.main_owner}
                            onChange={(e) => setKRDraft(o.id, { main_owner: e.target.value })}
                          />
                        </div>
                        <div style={{ width: 160 }}>
                          <div style={styles.label}>进度（手填 0-100）</div>
                          <input
                            style={styles.input}
                            type="number"
                            value={krDraft.progress}
                            onChange={(e) => setKRDraft(o.id, { progress: e.target.value })}
                          />
                        </div>
                      </div>

                      {krDraft.error ? <div style={styles.toastErr}>{krDraft.error}</div> : null}

                      <Button onClick={() => addKR(o.id)} disabled={krDraft.saving}>
                        {krDraft.saving ? "新增中..." : "新增 KR"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </>
      )}

      {/* Checkin Modal (by Task) */}
      <Modal
        open={!!checkinModal}
        title={
          checkinModal
            ? `复盘（按 Task）｜${checkinModal.kr.title}（负责人：${ownerLabel(checkinModal.kr)}）`
            : ""
        }
        onClose={() => setCheckinModal(null)}
      >
        {checkinModal ? (
          <TaskCheckinPanel
            kr={checkinModal.kr}
            isEditing={checkinModal.isEditing}
            focusTaskId={checkinModal.focusTaskId}
          />
        ) : null}
      </Modal>

      <div style={styles.footer}>
        <span style={{ opacity: 0.7 }}>OKR Nexus</span>
        <span style={{ opacity: 0.35 }}>·</span>
        <span style={{ opacity: 0.55 }}>Tahoe Light UI</span>
      </div>
    </div>
  );
}

/* ----------------------------- Tahoe Light Styles ----------------------------- */
const styles = {
  container: {
    maxWidth: 1180,
    margin: "22px auto",
    padding: "0 16px 36px",
  },

  // Topbar (light glass)
  topbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    background: "rgba(255,255,255,0.72)",
    border: "1px solid rgba(15,23,42,0.10)",
    boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
    backdropFilter: "blur(14px)",
    position: "sticky",
    top: 12,
    zIndex: 5,
  },
  logoOrb: {
    width: 36,
    height: 36,
    borderRadius: 14,
    background:
      "radial-gradient(circle at 30% 30%, rgba(0,122,255,0.9), rgba(175,82,222,0.75) 55%, rgba(52,199,89,0.55) 100%)",
    boxShadow: "0 10px 20px rgba(0,122,255,0.15)",
    border: "1px solid rgba(15,23,42,0.08)",
  },
  appTitle: { fontWeight: 800, letterSpacing: 0.2, fontSize: 16, color: "#0B1220" },
  appSub: { marginTop: 2, fontSize: 12, color: "rgba(11,18,32,0.55)" },

  tabs: {
    display: "flex",
    gap: 6,
    padding: 6,
    borderRadius: 14,
    background: "rgba(15,23,42,0.04)",
    border: "1px solid rgba(15,23,42,0.08)",
  },
  tab: {
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid transparent",
    background: "transparent",
    cursor: "pointer",
    fontWeight: 700,
    color: "rgba(11,18,32,0.70)",
  },
  tabActive: {
    padding: "8px 12px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 800,
    color: "#0B1220",
    border: "1px solid rgba(0,122,255,0.18)",
    background: "rgba(0,122,255,0.10)",
  },

  // Panels
  panel: {
    marginTop: 14,
    borderRadius: 18,
    padding: 14,
    background: "rgba(255,255,255,0.78)",
    border: "1px solid rgba(15,23,42,0.10)",
    boxShadow: "0 10px 26px rgba(15,23,42,0.06)",
    backdropFilter: "blur(14px)",
  },
  subPanel: {
    borderRadius: 16,
    padding: 12,
    background: "rgba(15,23,42,0.02)",
    border: "1px dashed rgba(15,23,42,0.14)",
  },
  panelHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },

  // Typography
  h3: { fontWeight: 800, fontSize: 15, margin: 0 },
  sectionTitle: { fontWeight: 800, color: "rgba(11,18,32,0.92)" },
  muted: { color: "rgba(11,18,32,0.56)", fontSize: 12 },

  // Inputs
  label: { fontSize: 12, color: "rgba(11,18,32,0.62)", marginBottom: 6 },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(15,23,42,0.12)",
    background: "rgba(255,255,255,0.85)",
    color: "#0B1220",
    outline: "none",
    boxShadow: "0 1px 0 rgba(15,23,42,0.03) inset",
  },
  inlineInput: {
    width: 140,
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid rgba(15,23,42,0.12)",
    background: "rgba(255,255,255,0.85)",
    color: "#0B1220",
    outline: "none",
  },

  // Buttons
  btnBase: { border: "1px solid transparent", borderRadius: 12, padding: "10px 12px", fontWeight: 800, transition: "transform 100ms ease, box-shadow 120ms ease" },
  btnPrimary: { color: "#ffffff", background: "linear-gradient(180deg, rgba(0,122,255,0.95), rgba(0,122,255,0.78))", boxShadow: "0 10px 18px rgba(0,122,255,0.18)" },
  btnSoft: { color: "#0B1220", background: "rgba(15,23,42,0.06)", border: "1px solid rgba(15,23,42,0.10)" },
  btnGhost: { color: "#0B1220", background: "rgba(255,255,255,0.65)", border: "1px solid rgba(15,23,42,0.10)" },

  // Chips
  chip: { display: "inline-flex", alignItems: "center", padding: "6px 10px", borderRadius: 999, fontWeight: 800, fontSize: 12, border: "1px solid rgba(15,23,42,0.10)", background: "rgba(255,255,255,0.75)" },
  chipGray: { color: "rgba(11,18,32,0.78)" },
  chipBlue: { color: "#0A66FF", background: "rgba(0,122,255,0.10)", border: "1px solid rgba(0,122,255,0.18)" },
  chipGreen: { color: "#0E7A2A", background: "rgba(52,199,89,0.10)", border: "1px solid rgba(52,199,89,0.18)" },
  chipViolet: { color: "#6E3BC6", background: "rgba(175,82,222,0.10)", border: "1px solid rgba(175,82,222,0.18)" },

  toastErr: {
    marginTop: 10,
    marginBottom: 10,
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(255, 59, 48, 0.10)",
    border: "1px solid rgba(255, 59, 48, 0.18)",
    color: "rgba(150, 20, 20, 0.95)",
    fontWeight: 800,
  },

  // Progress
  progressTrack: { height: 6, borderRadius: 999, background: "rgba(15,23,42,0.08)", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999, background: "linear-gradient(90deg, rgba(0,122,255,0.95), rgba(175,82,222,0.65), rgba(52,199,89,0.75))", boxShadow: "0 6px 16px rgba(0,122,255,0.16)" },

  // O header
  oHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  oTitleRow: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 },
  oIndex: { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 44, padding: "6px 10px", borderRadius: 12, background: "rgba(0,122,255,0.12)", border: "1px solid rgba(0,122,255,0.18)", color: "#0B1220", fontWeight: 900 },
  oTitleText: { fontWeight: 800, fontSize: 16, color: "#0B1220", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  oMetaRow: { marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  titleInput: { width: "min(680px, 70vw)", padding: "9px 10px", borderRadius: 12, border: "1px solid rgba(15,23,42,0.12)", background: "rgba(255,255,255,0.90)", outline: "none", fontWeight: 800 },

  // KR / Task blocks
  krBlock: { borderRadius: 16, border: "1px solid rgba(15,23,42,0.10)", background: "rgba(255,255,255,0.65)", padding: 10 },
  krCompactRow: { display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 10px", borderRadius: 16, border: "1px solid rgba(15,23,42,0.10)", background: "rgba(255,255,255,0.70)" },
  krLeft: { display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0, flex: 1.3 },
  krBadge: { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 54, height: 28, padding: "0 10px", borderRadius: 999, background: "rgba(15,23,42,0.06)", border: "1px solid rgba(15,23,42,0.10)", fontWeight: 900, color: "rgba(11,18,32,0.85)" },
  krTitleText: { fontWeight: 800, color: "#0B1220", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 520 },
  krTitleInput: { width: "min(560px, 52vw)", padding: "7px 10px", borderRadius: 12, border: "1px solid rgba(15,23,42,0.12)", background: "rgba(255,255,255,0.90)", outline: "none", fontWeight: 800 },
  krSubLine: { marginTop: 6, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  krSubLabel: { fontSize: 12, color: "rgba(11,18,32,0.55)", fontWeight: 700 },
  krSubValue: { fontSize: 12, color: "rgba(11,18,32,0.78)", fontWeight: 800 },
  krMiniInput: { width: 120, padding: "6px 8px", borderRadius: 10, border: "1px solid rgba(15,23,42,0.12)", background: "rgba(255,255,255,0.90)", outline: "none", fontSize: 12, fontWeight: 800 },
  krRight: { display: "flex", alignItems: "center", gap: 10, flex: 1, justifyContent: "flex-end", flexWrap: "wrap" },

  taskRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 10px",
    borderRadius: 16,
    border: "1px solid rgba(15,23,42,0.10)",
    background: "rgba(255,255,255,0.78)",
  },
  taskBadge: { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 46, height: 28, padding: "0 10px", borderRadius: 999, background: "rgba(52,199,89,0.10)", border: "1px solid rgba(52,199,89,0.18)", fontWeight: 900, color: "rgba(11,18,32,0.90)" },
  taskTitleText: { fontWeight: 900, color: "#0B1220", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  taskTitleInput: { width: "min(620px, 62vw)", padding: "7px 10px", borderRadius: 12, border: "1px solid rgba(15,23,42,0.12)", background: "rgba(255,255,255,0.90)", outline: "none", fontWeight: 900 },
  taskSub: { marginTop: 8, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" },

  // Layout helpers
  grid4: { display: "grid", gridTemplateColumns: "1fr 1.4fr 1fr 2fr", gap: 12 },
  formRow: { display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" },

  // Menu
  iconBtn: { width: 40, height: 36, borderRadius: 12, border: "1px solid rgba(15,23,42,0.10)", background: "rgba(255,255,255,0.80)", color: "#0B1220", cursor: "pointer", fontWeight: 900 },
  menu: { position: "absolute", right: 0, top: 44, minWidth: 170, background: "rgba(255,255,255,0.95)", border: "1px solid rgba(15,23,42,0.12)", borderRadius: 14, boxShadow: "0 18px 40px rgba(15,23,42,0.12)", padding: 6, zIndex: 20, backdropFilter: "blur(12px)" },
  menuItem: { width: "100%", textAlign: "left", padding: "10px 10px", border: "none", background: "transparent", borderRadius: 12, cursor: "pointer", fontSize: 14, color: "rgba(11,18,32,0.90)", fontWeight: 700 },
  menuItemDanger: { width: "100%", textAlign: "left", padding: "10px 10px", border: "none", background: "transparent", borderRadius: 12, cursor: "pointer", fontSize: 14, color: "rgba(190, 30, 30, 0.95)", fontWeight: 900 },

  // Modal
  modalMask: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.25)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 },
  modal: { width: "min(1040px, 96vw)", maxHeight: "86vh", overflow: "auto", background: "rgba(255,255,255,0.92)", borderRadius: 18, border: "1px solid rgba(15,23,42,0.12)", boxShadow: "0 28px 70px rgba(15,23,42,0.18)", backdropFilter: "blur(16px)" },
  modalHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 12px 10px 12px", borderBottom: "1px solid rgba(15,23,42,0.10)" },
  modalTitle: { fontWeight: 900, color: "#0B1220" },
  modalBody: { padding: 12 },

  // Checkins
  checkinRow: { display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 0", borderBottom: "1px solid rgba(15,23,42,0.08)" },
  taskHistoryCard: { borderRadius: 16, border: "1px solid rgba(15,23,42,0.10)", background: "rgba(255,255,255,0.78)", padding: 12 },
  taskHistoryHeader: { display: "flex", justifyContent: "space-between", gap: 10 },

  // Tree
  treeTopBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" },
  zoomBar: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" },
  treeWrap: { position: "relative", overflow: "auto", borderRadius: 18, background: "rgba(255,255,255,0.65)", border: "1px solid rgba(15,23,42,0.10)", height: "72vh" },
  treeWrapFullscreen: { position: "relative", overflow: "auto", borderRadius: 0, background: "rgba(255,255,255,0.92)", border: "none", width: "100%", height: "100%" },
  treeSvg: { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" },
  treeLevel: { position: "relative", display: "flex", justifyContent: "center", zIndex: 1 },
  treeRow: { display: "flex", gap: 24, justifyContent: "center", alignItems: "flex-start", flexWrap: "nowrap" },
  krCol: { display: "flex", flexDirection: "column", gap: 14, minWidth: 300 },

  nodeCard: { width: 260, borderRadius: 18, border: "1px solid rgba(15,23,42,0.10)", background: "rgba(255,255,255,0.80)", padding: 14, boxShadow: "0 10px 26px rgba(15,23,42,0.06)" },
  nodeRoot: { width: 320 },
  nodeTitle: { fontWeight: 900, fontSize: 15, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 },
  nodeGlyph: { display: "inline-flex", width: 26, height: 26, borderRadius: 10, alignItems: "center", justifyContent: "center", background: "rgba(0,122,255,0.10)", border: "1px solid rgba(0,122,255,0.16)", fontWeight: 900 },
  nodeSub: { color: "rgba(11,18,32,0.86)", fontSize: 13, marginBottom: 10, lineHeight: 1.35, maxHeight: 44, overflow: "hidden", textOverflow: "ellipsis" },
  nodeSubSmall: { color: "rgba(11,18,32,0.58)", fontSize: 12 },
  nodeMeta: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, borderTop: "1px solid rgba(15,23,42,0.08)", paddingTop: 10, marginBottom: 10 },
  nodeMetaLeft: { color: "rgba(11,18,32,0.58)", fontSize: 12, fontWeight: 700 },
  nodeProgress: { fontWeight: 900, color: "rgba(11,18,32,0.85)" },

  // Login
  center: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  loginCard: { width: "min(560px, 92vw)", borderRadius: 22, padding: 18, background: "rgba(255,255,255,0.90)", border: "1px solid rgba(15,23,42,0.10)", boxShadow: "0 30px 70px rgba(15,23,42,0.12)", backdropFilter: "blur(16px)" },
  brandRow: { display: "flex", alignItems: "center", gap: 12 },
  brandMark: { width: 44, height: 44, borderRadius: 16, background: "radial-gradient(circle at 30% 30%, rgba(0,122,255,0.9), rgba(175,82,222,0.75) 55%, rgba(52,199,89,0.55) 100%)", boxShadow: "0 14px 26px rgba(0,122,255,0.16)", border: "1px solid rgba(15,23,42,0.08)" },
  brandTitle: { fontWeight: 950, letterSpacing: 0.3, fontSize: 18 },
  brandSub: { marginTop: 2, fontSize: 12, color: "rgba(11,18,32,0.55)" },

  footer: { marginTop: 16, display: "flex", justifyContent: "center", gap: 10, fontSize: 12, color: "rgba(11,18,32,0.50)" },
};
