import { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
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

  // okr_items: O/KR
  const [items, setItems] = useState([]);

  // tasks + task checkins
  const [tasks, setTasks] = useState([]);
  const [taskCheckins, setTaskCheckins] = useState([]);

  // UI state
  const [page, setPage] = useState("list"); // list | tree
  const [editingOId, setEditingOId] = useState(null);

  // New O (collapsed)
  const [showNewO, setShowNewO] = useState(false);
  const [newOTitle, setNewOTitle] = useState("");
  const [newOMainOwner, setNewOMainOwner] = useState("");
  const [newOProgress, setNewOProgress] = useState("0");
  const [newOError, setNewOError] = useState("");

  // Add KR drafts by O
  const [krDrafts, setKrDrafts] = useState({});

  // KR Modal (Task + Checkins)
  const [krModal, setKrModal] = useState(null); // { kr, isEditing }
  const [taskDrafts, setTaskDrafts] = useState({}); // by krId: {title, owner, progress, error, saving}
  const [openTaskId, setOpenTaskId] = useState(null); // accordion

  // Task checkin drafts by taskId
  const [taskCkDrafts, setTaskCkDrafts] = useState({});

  // menus
  const [menuOpenKey, setMenuOpenKey] = useState(null);
  const menuRootRef = useRef(null);

  // ---------- Tahoe Light background ----------
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

  // click outside to close menu
  useEffect(() => {
    function onDocClick(e) {
      if (!menuRootRef.current) return;
      if (!menuRootRef.current.contains(e.target)) setMenuOpenKey(null);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // ---------- Helpers ----------
  const nf = useMemo(() => new Intl.NumberFormat("zh-CN"), []);
  function formatNumber(n) {
    if (n === null || n === undefined || n === "") return "-";
    const num = Number(n);
    if (!Number.isFinite(num)) return String(n);
    return nf.format(num);
  }

  function safeInt(v, fallback = 0) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function safeNumber(v) {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function ymToFirstDay(ym) {
    if (!ym || ym.length < 7) return null;
    return `${ym}-01`;
  }

  function ownerLabel(obj) {
    const a = (obj?.main_owner || "").trim();
    const b = (obj?.owner_name || "").trim();
    const c = (obj?.owner_email || "").trim();
    return a || b || c || "未设置";
  }

  function taskOwnerLabel(t) {
    const a = (t?.main_owner || "").trim();
    return a || "未设置";
  }

  // ---------- Auth ----------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session)
    );
    return () => listener.subscription.unsubscribe();
  }, []);

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

  // ---------- Data loading ----------
  useEffect(() => {
    if (session) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function loadAll() {
    setLoading(true);

    const [a, b, c] = await Promise.all([
      supabase.from("okr_items").select("*").order("created_at", { ascending: true }),
      supabase.from("okr_tasks").select("*").order("created_at", { ascending: true }),
      supabase
        .from("okr_task_checkins")
        .select("*")
        .order("created_at", { ascending: true }),
    ]);

    setLoading(false);

    if (a.error) {
      alert("加载 okr_items 失败：" + (a.error.message || "unknown error"));
      setItems([]);
      return;
    }
    if (b.error) {
      alert("加载 okr_tasks 失败：" + (b.error.message || "unknown error"));
      setTasks([]);
    } else setTasks(b.data || []);
    if (c.error) {
      alert("加载 okr_task_checkins 失败：" + (c.error.message || "unknown error"));
      setTaskCheckins([]);
    } else setTaskCheckins(c.data || []);

    const data = a.data || [];
    setItems(data);

    // init kr drafts
    const os = data.filter((x) => x.type === "O");
    setKrDrafts((prev) => {
      const next = { ...prev };
      for (const o of os) {
        if (!next[o.id]) {
          next[o.id] = {
            title: "",
            main_owner: "",
            target: "",
            current: "",
            progress: "0",
            error: "",
            saving: false,
          };
        }
      }
      return next;
    });

    // init task drafts + checkin drafts
    const krs = data.filter((x) => x.type === "KR");
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    setTaskDrafts((prev) => {
      const next = { ...prev };
      for (const kr of krs) {
        if (!next[kr.id]) {
          next[kr.id] = { title: "", main_owner: "", progress: "0", saving: false, error: "" };
        }
      }
      return next;
    });

    setTaskCkDrafts((prev) => {
      const next = { ...prev };
      // 给每个 task 初始化
      for (const t of (b.data || [])) {
        if (!next[t.id]) {
          next[t.id] = { month: ym, value: "", note: "", saving: false, error: "" };
        }
      }
      return next;
    });
  }

  // ---------- Derived ----------
  const objectives = useMemo(() => {
    const os = items.filter((r) => r.type === "O");
    const krs = items.filter((r) => r.type === "KR");
    return os.map((o) => ({
      ...o,
      krs: krs.filter((k) => k.parent_id === o.id),
    }));
  }, [items]);

  const tasksByKr = useMemo(() => {
    const map = {};
    for (const t of tasks) {
      if (!map[t.kr_id]) map[t.kr_id] = [];
      map[t.kr_id].push(t);
    }
    return map;
  }, [tasks]);

  const checkinsByTask = useMemo(() => {
    const map = {};
    for (const ck of taskCheckins) {
      if (!map[ck.task_id]) map[ck.task_id] = [];
      map[ck.task_id].push(ck);
    }
    return map;
  }, [taskCheckins]);

  // ---------- Generic DB helpers ----------
  async function updateItem(id, patch) {
    const { error } = await supabase.from("okr_items").update(patch).eq("id", id);
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
    if (krModal?.kr?.id === id) setKrModal(null);
    await loadAll();
  }

  async function updateTitle(id, raw) {
    const title = (raw || "").trim();
    if (!title) {
      alert("标题不能为空");
      await loadAll();
      return;
    }
    const ok = await updateItem(id, { title });
    if (ok) await loadAll();
  }

  async function updateMainOwner(id, raw) {
    const main_owner = (raw || "").trim();
    const ok = await updateItem(id, { main_owner: main_owner || null });
    if (ok) await loadAll();
  }

  async function updateProgress(id, raw) {
    const p = safeInt(raw, 0);
    const ok = await updateItem(id, { progress_percent: p });
    if (ok) await loadAll();
  }

  async function updateKRTarget(krId, raw) {
    const n = safeNumber(raw);
    const ok = await updateItem(krId, { target_value: n });
    if (ok) await loadAll();
  }
  async function updateKRCurrent(krId, raw) {
    const n = safeNumber(raw);
    const ok = await updateItem(krId, { current_value: n });
    if (ok) await loadAll();
  }

  // ---------- Create O / KR ----------
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
      parent_id: null,
      level: "company",
      department: "company",
      main_owner: (newOMainOwner || "").trim() || null,
      progress_percent: safeInt(newOProgress, 0),
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

  function setKRDraft(objectiveId, patch) {
    setKrDrafts((prev) => ({
      ...prev,
      [objectiveId]: { ...(prev[objectiveId] || {}), ...patch },
    }));
  }

  async function addKR(objectiveId) {
    const d = krDrafts[objectiveId] || {};
    const title = (d.title || "").trim();
    const main_owner = (d.main_owner || "").trim();
    const progress = safeInt(d.progress, 0);

    if (!title) return setKRDraft(objectiveId, { error: "请填写 KR 描述" });

    setKRDraft(objectiveId, { error: "", saving: true });

    const payload = {
      id: crypto.randomUUID(),
      title,
      type: "KR",
      parent_id: objectiveId,
      level: "company",
      department: "company",
      main_owner: main_owner || null,
      target_value: safeNumber(d.target),
      current_value: safeNumber(d.current),
      progress_percent: progress,
      owner_id: session.user.id,
      owner_email: session.user.email,
      owner_name: session.user.email,
    };

    const { error } = await supabase.from("okr_items").insert(payload);
    if (error) {
      setKRDraft(objectiveId, {
        saving: false,
        error: "新增 KR 失败：" + (error.message || "unknown"),
      });
      return;
    }

    setKRDraft(objectiveId, {
      title: "",
      main_owner: "",
      target: "",
      current: "",
      progress: "0",
      saving: false,
      error: "",
    });
    await loadAll();
  }

  // ---------- Tasks CRUD ----------
  function setTaskDraft(krId, patch) {
    setTaskDrafts((prev) => ({
      ...prev,
      [krId]: { ...(prev[krId] || {}), ...patch },
    }));
  }

  async function addTask(krId) {
    const d = taskDrafts[krId] || {};
    const title = (d.title || "").trim();
    const main_owner = (d.main_owner || "").trim();
    const progress = safeInt(d.progress, 0);

    if (!title) return setTaskDraft(krId, { error: "请填写 Task 描述" });

    setTaskDraft(krId, { saving: true, error: "" });

    const payload = {
      id: crypto.randomUUID(),
      kr_id: krId,
      title,
      main_owner: main_owner || null,
      progress_percent: progress,
      created_by: session.user.id,
    };

    const { error } = await supabase.from("okr_tasks").insert(payload);
    if (error) {
      setTaskDraft(krId, { saving: false, error: "新增 Task 失败：" + (error.message || "unknown") });
      return;
    }

    setTaskDraft(krId, { title: "", main_owner: "", progress: "0", saving: false, error: "" });
    await loadAll();
  }

  async function updateTask(taskId, patch) {
    const { error } = await supabase.from("okr_tasks").update(patch).eq("id", taskId);
    if (error) {
      alert("Task 保存失败：" + (error.message || "unknown error"));
      return false;
    }
    return true;
  }

  async function deleteTask(taskId) {
    setMenuOpenKey(null);
    if (!confirm("确认删除这个 Task？（会连带删除该 Task 的复盘记录）")) return;
    const { error } = await supabase.from("okr_tasks").delete().eq("id", taskId);
    if (error) return alert("删除失败：" + (error.message || "unknown error"));
    if (openTaskId === taskId) setOpenTaskId(null);
    await loadAll();
  }

  // ---------- Task Check-ins ----------
  function setTaskCkDraft(taskId, patch) {
    setTaskCkDrafts((prev) => ({
      ...prev,
      [taskId]: { ...(prev[taskId] || {}), ...patch },
    }));
  }

  async function upsertTaskCheckin(task) {
    const d = taskCkDrafts[task.id] || { month: "", value: "", note: "" };
    const monthFirstDay = ymToFirstDay(d.month);
    if (!monthFirstDay) return setTaskCkDraft(task.id, { error: "请选择月份" });

    const valueNum = safeNumber(d.value); // 允许为空
    setTaskCkDraft(task.id, { saving: true, error: "" });

    const payload = {
      id: crypto.randomUUID(),
      task_id: task.id,
      month: monthFirstDay,
      value: valueNum,
      note: (d.note || "").trim(),
      created_by: session.user.id,
    };

    const { error } = await supabase
      .from("okr_task_checkins")
      .upsert(payload, { onConflict: "task_id,month" });

    if (error) {
      setTaskCkDraft(task.id, { saving: false, error: "记录失败：" + (error.message || "unknown") });
      return;
    }

    setTaskCkDraft(task.id, { value: "", note: "", saving: false, error: "" });
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

  // ---------- UI building blocks ----------
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
    const v = Math.max(0, Math.min(100, Number(value) || 0));
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
        <button
          style={styles.iconBtn}
          onClick={() => setMenuOpenKey(isOpen ? null : menuKey)}
          title="更多"
        >
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

  // ---------- Tree View (保持到 KR 层) ----------
  function TreeView({ objectives }) {
    const wrapRef = useRef(null);
    const contentRef = useRef(null);
    const [lines, setLines] = useState([]);
    const nodeRefs = useRef(new Map());
    const [scale, setScale] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const root = useMemo(
      () => ({ id: "root", title: "年度 OKR", type: "ROOT", main_owner: "公司", progress_percent: 0 }),
      []
    );

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

      for (const o of objectives) {
        const rootEl = nodeRefs.current.get(`root`);
        const oEl = nodeRefs.current.get(`o:${o.id}`);
        if (!rootEl || !oEl) continue;

        const a = calcPos(rootEl);
        const b = calcPos(oEl);
        newLines.push({ x1: a.x, y1: a.bottom, x2: b.x, y2: b.top });

        for (const kr of o.krs) {
          const krEl = nodeRefs.current.get(`kr:${kr.id}`);
          if (!krEl) continue;
          const c = calcPos(oEl);
          const d = calcPos(krEl);
          newLines.push({ x1: c.x, y1: c.bottom, x2: d.x, y2: d.top });
        }
      }
      setLines(newLines);
    }

    useLayoutEffect(() => {
      recomputeLines();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [objectives, scale]);

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
        setScale((s) => clamp(round2(s + (e.deltaY > 0 ? -0.08 : 0.08)), 0.55, 2.0));
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

    function clamp(n, a, b) {
      return Math.max(a, Math.min(b, n));
    }
    function round2(n) {
      return Math.round(n * 100) / 100;
    }
    function zoomIn() {
      setScale((s) => clamp(round2(s + 0.1), 0.55, 2.0));
    }
    function zoomOut() {
      setScale((s) => clamp(round2(s - 0.1), 0.55, 2.0));
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
        const next = clamp(round2(Math.min(ratioW, ratioH)), 0.55, 2.0);
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

    // 手填进度：root 用 O 的平均
    const rootProgress =
      objectives.length === 0
        ? 0
        : Math.round(objectives.reduce((acc, o) => acc + (o.progress_percent ?? 0), 0) / objectives.length);

    return (
      <div style={styles.panel}>
        <div style={styles.treeTopBar}>
          <div>
            <div style={styles.h3}>关系树</div>
            <div style={styles.muted}>Ctrl/⌘ + 滚轮缩放；点击 KR 打开任务/复盘</div>
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

            <div style={styles.treeLevel}>
              <div ref={(el) => setRef("root", el)} style={{ ...styles.nodeCard, ...styles.nodeRoot }}>
                <div style={styles.nodeTitle}>
                  <span style={styles.nodeGlyph}>◎</span>
                  {root.title}
                </div>
                <div style={styles.nodeSubSmall}>负责人：{ownerLabel(root)}</div>
                <div style={styles.nodeMeta}>
                  <span style={styles.nodeMetaLeft}>类型：公司</span>
                  <span style={styles.nodeProgress}>{rootProgress}%</span>
                </div>
                <ProgressBar value={rootProgress} />
              </div>
            </div>

            <div style={{ ...styles.treeLevel, marginTop: 20 }}>
              <div style={styles.treeRow}>
                {objectives.map((o, idx) => (
                  <div key={o.id} ref={(el) => setRef(`o:${o.id}`, el)} style={styles.nodeCard}>
                    <div style={styles.nodeTitle}>
                      <span style={styles.nodeGlyph}>O</span>
                      {`O${idx + 1}`}
                    </div>
                    <div style={styles.nodeSub}>{o.title}</div>
                    <div style={styles.nodeSubSmall}>负责人：{ownerLabel(o)}</div>
                    <div style={styles.nodeMeta}>
                      <span style={styles.nodeMetaLeft}>公司</span>
                      <span style={styles.nodeProgress}>{o.progress_percent ?? 0}%</span>
                    </div>
                    <ProgressBar value={o.progress_percent ?? 0} />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ ...styles.treeLevel, marginTop: 20 }}>
              <div style={styles.treeRow}>
                {objectives.map((o) => (
                  <div key={o.id} style={styles.krCol}>
                    {(o.krs || []).map((k, kIdx) => (
                      <div
                        key={k.id}
                        ref={(el) => setRef(`kr:${k.id}`, el)}
                        style={{ ...styles.nodeCard, cursor: "pointer" }}
                        onClick={() => setKrModal({ kr: k, isEditing: false })}
                        title="点击打开任务/复盘"
                      >
                        <div style={styles.nodeTitle}>
                          <span style={styles.nodeGlyph}>K</span>
                          {`KR${kIdx + 1}`}
                        </div>
                        <div style={styles.nodeSub}>{k.title}</div>
                        <div style={styles.nodeSubSmall}>负责人：{ownerLabel(k)}</div>
                        <div style={styles.nodeMeta}>
                          <span style={styles.nodeMetaLeft}>
                            进度：{k.progress_percent ?? 0}%
                          </span>
                          <span style={styles.nodeProgress}>{k.progress_percent ?? 0}%</span>
                        </div>
                        <ProgressBar value={k.progress_percent ?? 0} />
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

  // ---------- Auth page ----------
  if (!session) {
    return (
      <div style={styles.center}>
        <div style={styles.loginCard}>
          <div style={styles.brandRow}>
            <div style={styles.brandMark} />
            <div>
              <div style={styles.brandTitle}>OKR Nexus</div>
              <div style={styles.brandSub}>O → KR → Task · Task 月度复盘</div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={styles.h3}>登录</div>
            <div style={styles.muted}>邮箱登录（Magic Link）</div>
          </div>

          <input
            style={styles.input}
            placeholder="输入邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <Button onClick={signIn} disabled={authSending}>
            {authSending ? "发送中..." : "发送登录链接"}
          </Button>

          <div style={{ marginTop: 12, ...styles.muted }}>* 若没收到邮件，请检查垃圾箱</div>
        </div>
      </div>
    );
  }

  // ---------- KR Modal content: Task + Task Checkins ----------
  function KRTasksModal({ kr, isEditing }) {
    const list = tasksByKr[kr.id] || [];
    const draft = taskDrafts[kr.id] || { title: "", main_owner: "", progress: "0", saving: false, error: "" };

    return (
      <div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 950, fontSize: 14, color: "#0B1220" }}>{kr.title}</div>
            <div style={styles.muted}>
              KR 负责人：<b>{ownerLabel(kr)}</b> · KR 进度（手填）：<b>{kr.progress_percent ?? 0}%</b>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {isEditing ? <Chip tone="green">编辑模式</Chip> : <Chip tone="gray">只读</Chip>}
          </div>
        </div>

        {/* Tasks list */}
        <div style={{ marginTop: 14 }}>
          <div style={styles.sectionTitle}>实施任务（Task）</div>
          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            {list.length ? (
              list.map((t, idx) => {
                const isOpen = openTaskId === t.id;
                const ckDraft = taskCkDrafts[t.id] || { month: "", value: "", note: "", saving: false, error: "" };
                const history = (checkinsByTask[t.id] || []).slice().sort((a, b) => String(b.month).localeCompare(String(a.month)));

                return (
                  <div key={t.id} style={styles.taskCard}>
                    <div style={styles.taskTopRow}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                        <span style={styles.taskBadge}>{`T${idx + 1}`}</span>

                        <div style={{ minWidth: 0 }}>
                          {isEditing ? (
                            <input
                              style={styles.taskTitleInput}
                              defaultValue={t.title}
                              onBlur={async (e) => {
                                const v = (e.target.value || "").trim();
                                if (!v) return alert("Task 标题不能为空");
                                const ok = await updateTask(t.id, { title: v });
                                if (ok) await loadAll();
                              }}
                            />
                          ) : (
                            <div style={styles.taskTitleText} title={t.title}>
                              {t.title}
                            </div>
                          )}

                          <div style={styles.taskSubLine}>
                            <span style={styles.krSubLabel}>负责人：</span>
                            {isEditing ? (
                              <input
                                style={styles.krMiniInput}
                                defaultValue={t.main_owner || ""}
                                placeholder="姓名"
                                onBlur={async (e) => {
                                  const v = (e.target.value || "").trim() || null;
                                  const ok = await updateTask(t.id, { main_owner: v });
                                  if (ok) await loadAll();
                                }}
                              />
                            ) : (
                              <span style={styles.krSubValue}>{taskOwnerLabel(t)}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <div style={{ minWidth: 160 }}>
                          <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <Chip tone={t.progress_percent >= 80 ? "green" : t.progress_percent >= 40 ? "blue" : "violet"}>
                              进度 {t.progress_percent ?? 0}%
                            </Chip>
                          </div>
                          <ProgressBar value={t.progress_percent ?? 0} />
                        </div>

                        {isEditing ? (
                          <div style={styles.taskProgressEdit}>
                            <span style={styles.krSubLabel}>进度：</span>
                            <input
                              style={styles.krNumInput}
                              type="number"
                              defaultValue={t.progress_percent ?? 0}
                              onBlur={async (e) => {
                                const p = safeInt(e.target.value, 0);
                                const ok = await updateTask(t.id, { progress_percent: p });
                                if (ok) await loadAll();
                              }}
                            />
                          </div>
                        ) : null}

                        <Button variant="ghost" onClick={() => setOpenTaskId(isOpen ? null : t.id)}>
                          {isOpen ? "收起复盘" : "复盘"}
                        </Button>

                        {isEditing ? (
                          <MoreMenu
                            menuKey={`task:${t.id}`}
                            items={[{ label: "删除 Task", danger: true, onClick: () => deleteTask(t.id) }]}
                          />
                        ) : null}
                      </div>
                    </div>

                    {/* Task checkin accordion */}
                    {isOpen ? (
                      <div style={{ marginTop: 12, ...styles.taskCheckinBox }}>
                        <div style={styles.sectionTitle}>Task 月度复盘</div>

                        {isEditing ? (
                          <>
                            <div style={styles.grid3}>
                              <div>
                                <div style={styles.label}>月份</div>
                                <input
                                  style={styles.input}
                                  type="month"
                                  value={ckDraft.month}
                                  onChange={(e) => setTaskCkDraft(t.id, { month: e.target.value })}
                                />
                              </div>
                              <div>
                                <div style={styles.label}>本月实际值（可选）</div>
                                <input
                                  style={styles.input}
                                  type="number"
                                  placeholder="例如：5000000"
                                  value={ckDraft.value}
                                  onChange={(e) => setTaskCkDraft(t.id, { value: e.target.value })}
                                />
                              </div>
                              <div>
                                <div style={styles.label}>备注（可选）</div>
                                <input
                                  style={styles.input}
                                  placeholder="例如：本月已完成 A/B 测试并上线"
                                  value={ckDraft.note}
                                  onChange={(e) => setTaskCkDraft(t.id, { note: e.target.value })}
                                />
                              </div>
                            </div>

                            {ckDraft.error ? <div style={styles.toastErr}>{ckDraft.error}</div> : null}

                            <Button onClick={() => upsertTaskCheckin(t)} disabled={ckDraft.saving}>
                              {ckDraft.saving ? "记录中..." : "记录/覆盖当月复盘"}
                            </Button>
                          </>
                        ) : (
                          <div style={styles.muted}>
                            只读模式：如需录入/编辑复盘，请先在该 O 右上角点击「修改」进入编辑模式。
                          </div>
                        )}

                        <div style={{ marginTop: 14 }}>
                          <div style={styles.sectionTitle}>历史复盘</div>

                          {history.length ? (
                            <div style={{ marginTop: 10 }}>
                              {history.map((h) => (
                                <div key={h.id} style={styles.checkinRow}>
                                  <div style={{ width: 92 }}>
                                    <Chip tone="violet">{String(h.month).slice(0, 7)}</Chip>
                                  </div>

                                  {!isEditing ? (
                                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                                      <div>
                                        <span style={styles.muted}>值：</span>
                                        <b>{h.value === null ? "-" : formatNumber(h.value)}</b>
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
                                        defaultValue={h.value ?? ""}
                                        placeholder="可空"
                                        onBlur={async (e) => {
                                          const v = e.target.value;
                                          const n = v === "" ? null : safeNumber(v);
                                          if (v !== "" && n === null) return alert("请输入数字或留空");
                                          const ok = await updateTaskCheckin(h.id, { value: n });
                                          if (ok) await loadAll();
                                        }}
                                      />

                                      <span style={styles.muted}>备注：</span>
                                      <input
                                        style={{ ...styles.inlineInput, width: 360 }}
                                        defaultValue={h.note || ""}
                                        onBlur={async (e) => {
                                          const ok = await updateTaskCheckin(h.id, { note: e.target.value });
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
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div style={styles.muted}>暂无 Task（建议每条 KR 拆成若干具体任务）</div>
            )}
          </div>
        </div>

        {/* Add task */}
        <div style={{ marginTop: 14, ...styles.subPanel }}>
          <div style={styles.sectionTitle}>新增 Task</div>

          {isEditing ? (
            <>
              <div style={{ marginTop: 10 }} />
              <div style={styles.formRow}>
                <div style={{ flex: 2 }}>
                  <div style={styles.label}>Task 描述</div>
                  <input
                    style={styles.input}
                    placeholder="例如：完成货架电商 SOP（流程/模板/培训）"
                    value={draft.title}
                    onChange={(e) => setTaskDraft(kr.id, { title: e.target.value })}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={styles.label}>负责人</div>
                  <input
                    style={styles.input}
                    placeholder="例如：张三"
                    value={draft.main_owner}
                    onChange={(e) => setTaskDraft(kr.id, { main_owner: e.target.value })}
                  />
                </div>
                <div style={{ width: 140 }}>
                  <div style={styles.label}>进度(0-100)</div>
                  <input
                    style={styles.input}
                    type="number"
                    value={draft.progress}
                    onChange={(e) => setTaskDraft(kr.id, { progress: e.target.value })}
                  />
                </div>
              </div>

              {draft.error ? <div style={styles.toastErr}>{draft.error}</div> : null}

              <Button onClick={() => addTask(kr.id)} disabled={draft.saving}>
                {draft.saving ? "新增中..." : "新增 Task"}
              </Button>
            </>
          ) : (
            <div style={styles.muted}>只读模式：请先进入编辑模式再新增 Task。</div>
          )}
        </div>
      </div>
    );
  }

  // ---------- Main ----------
  return (
    <div style={styles.container} ref={menuRootRef}>
      {/* Top Nav */}
      <div style={styles.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={styles.logoOrb} />
          <div>
            <div style={styles.appTitle}>OKR Nexus</div>
            <div style={styles.appSub}>O → KR → Task · Task 月度复盘</div>
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

      {/* Tree Page */}
      {page === "tree" ? (
        <TreeView objectives={objectives} />
      ) : (
        <>
          {/* New Objective (Collapsed) */}
          <div style={styles.panel}>
            <div style={styles.panelHeaderRow}>
              <div>
                <div style={styles.h3}>Objective</div>
                <div style={styles.muted}>建议：O 只写方向；KR 拆 Task；复盘写在 Task 上</div>
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
                  <div style={{ width: 140 }}>
                    <div style={styles.label}>进度(0-100)</div>
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

          {/* Objectives List */}
          {objectives.map((o, idx) => {
            const isEditing = editingOId === o.id;
            const krDraft =
              krDrafts[o.id] || {
                title: "",
                main_owner: "",
                target: "",
                current: "",
                progress: "0",
                error: "",
                saving: false,
              };

            return (
              <div key={o.id} style={styles.panel}>
                {/* O Header */}
                <div style={styles.oHeader}>
                  <div style={{ minWidth: 0 }}>
                    <div style={styles.oTitleRow}>
                      <span style={styles.oIndex}>{`O${idx + 1}`}</span>
                      {isEditing ? (
                        <input style={styles.titleInput} defaultValue={o.title} onBlur={(e) => updateTitle(o.id, e.target.value)} />
                      ) : (
                        <span style={styles.oTitleText}>{o.title}</span>
                      )}
                    </div>

                    <div style={styles.oMetaRow}>
                      <Chip tone="gray">负责人：{ownerLabel(o)}</Chip>
                      <Chip tone="blue">进度：{o.progress_percent ?? 0}%</Chip>
                      {isEditing ? <span style={styles.muted}>（编辑后点空白处自动保存）</span> : null}
                    </div>

                    {isEditing ? (
                      <div style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ width: 360 }}>
                          <div style={styles.label}>主要负责人（可修改）</div>
                          <input
                            style={styles.input}
                            defaultValue={o.main_owner || ""}
                            placeholder="例如：张三"
                            onBlur={(e) => updateMainOwner(o.id, e.target.value)}
                          />
                        </div>
                        <div style={{ width: 160 }}>
                          <div style={styles.label}>O 进度（手填）</div>
                          <input
                            style={styles.input}
                            type="number"
                            defaultValue={o.progress_percent ?? 0}
                            onBlur={(e) => updateProgress(o.id, e.target.value)}
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
                        // 关闭弹窗时不强制
                        if (isEditing && krModal) setKrModal({ ...krModal, isEditing: false });
                      }}
                    >
                      {isEditing ? "完成" : "修改"}
                    </Button>

                    {isEditing ? (
                      <MoreMenu
                        menuKey={`o:${o.id}`}
                        items={[
                          { label: "删除 O", danger: true, onClick: () => deleteItem(o.id, `O${idx + 1}`) },
                        ]}
                      />
                    ) : null}
                  </div>
                </div>

                {/* KR List */}
                <div style={{ marginTop: 12 }}>
                  <div style={styles.sectionTitle}>KR</div>

                  {o.krs.length ? (
                    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                      {o.krs.map((k, kIdx) => {
                        const p = k.progress_percent ?? 0;
                        const tone = p >= 80 ? "green" : p >= 40 ? "blue" : "violet";
                        const taskCount = (tasksByKr[k.id] || []).length;

                        return (
                          <div key={k.id} style={styles.krCompactRow}>
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
                                      onBlur={(e) => updateMainOwner(k.id, e.target.value)}
                                    />
                                  ) : (
                                    <span style={styles.krSubValue}>{ownerLabel(k)}</span>
                                  )}

                                  <span style={{ ...styles.krSubLabel, marginLeft: 10 }}>任务：</span>
                                  <span style={styles.krSubValue}>{taskCount}</span>
                                </div>
                              </div>
                            </div>

                            <div style={styles.krRight}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 180 }}>
                                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                  <Chip tone={tone}>进度 {p}%</Chip>
                                </div>
                                <ProgressBar value={p} />
                              </div>

                              {isEditing ? (
                                <div style={styles.krNums}>
                                  <div style={styles.krNumBlock}>
                                    <div style={styles.krNumLabel}>KR 进度</div>
                                    <input
                                      style={styles.krNumInput}
                                      type="number"
                                      defaultValue={p}
                                      onBlur={(e) => updateProgress(k.id, e.target.value)}
                                    />
                                  </div>
                                </div>
                              ) : null}

                              {/* 保留 target/current，但不自动算 */}
                              <div style={styles.krNums}>
                                <div style={styles.krNumBlock}>
                                  <div style={styles.krNumLabel}>目标</div>
                                  {isEditing ? (
                                    <input
                                      style={styles.krNumInput}
                                      type="number"
                                      defaultValue={k.target_value ?? ""}
                                      placeholder="可空"
                                      onBlur={(e) => updateKRTarget(k.id, e.target.value)}
                                    />
                                  ) : (
                                    <div style={styles.krNumValue}>{k.target_value === null ? "-" : formatNumber(k.target_value)}</div>
                                  )}
                                </div>

                                <div style={styles.krNumBlock}>
                                  <div style={styles.krNumLabel}>当前</div>
                                  {isEditing ? (
                                    <input
                                      style={styles.krNumInput}
                                      type="number"
                                      defaultValue={k.current_value ?? ""}
                                      placeholder="可空"
                                      onBlur={(e) => updateKRCurrent(k.id, e.target.value)}
                                    />
                                  ) : (
                                    <div style={styles.krNumValue}>{k.current_value === null ? "-" : formatNumber(k.current_value)}</div>
                                  )}
                                </div>
                              </div>

                              <Button
                                variant="ghost"
                                onClick={() => {
                                  setMenuOpenKey(null);
                                  setOpenTaskId(null);
                                  setKrModal({ kr: k, isEditing });
                                }}
                              >
                                任务/复盘
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
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ marginTop: 10, ...styles.muted }}>还没有 KR（建议先拆出 KR，再在 KR 里拆 Task）</div>
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
                        <div style={{ width: 140 }}>
                          <div style={styles.label}>进度(0-100)</div>
                          <input
                            style={styles.input}
                            type="number"
                            value={krDraft.progress}
                            onChange={(e) => setKRDraft(o.id, { progress: e.target.value })}
                          />
                        </div>
                      </div>

                      <div style={styles.grid2}>
                        <div>
                          <div style={styles.label}>目标值（可选）</div>
                          <input
                            style={styles.input}
                            type="number"
                            placeholder="例如：26000000"
                            value={krDraft.target}
                            onChange={(e) => setKRDraft(o.id, { target: e.target.value })}
                          />
                        </div>
                        <div>
                          <div style={styles.label}>当前值（可选）</div>
                          <input
                            style={styles.input}
                            type="number"
                            placeholder="例如：5000000"
                            value={krDraft.current}
                            onChange={(e) => setKRDraft(o.id, { current: e.target.value })}
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

      {/* KR Modal */}
      <Modal
        open={!!krModal}
        title={
          krModal
            ? `KR｜任务与复盘（负责人：${ownerLabel(krModal.kr)}）`
            : ""
        }
        onClose={() => setKrModal(null)}
      >
        {krModal ? <KRTasksModal kr={krModal.kr} isEditing={krModal.isEditing} /> : null}
      </Modal>

      <div style={styles.footer}>
        <span style={{ opacity: 0.7 }}>OKR Nexus</span>
        <span style={{ opacity: 0.35 }}>·</span>
        <span style={{ opacity: 0.55 }}>O/KR/Task · Tahoe Light UI</span>
      </div>
    </div>
  );
}

/* ----------------------------- Tahoe Light Styles ----------------------------- */
const styles = {
  container: { maxWidth: 1180, margin: "22px auto", padding: "0 16px 36px" },

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

  h3: { fontWeight: 800, fontSize: 15, margin: 0 },
  sectionTitle: { fontWeight: 800, color: "rgba(11,18,32,0.92)" },
  muted: { color: "rgba(11,18,32,0.56)", fontSize: 12 },

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

  btnBase: { border: "1px solid transparent", borderRadius: 12, padding: "10px 12px", fontWeight: 800 },
  btnPrimary: {
    color: "#ffffff",
    background: "linear-gradient(180deg, rgba(0,122,255,0.95), rgba(0,122,255,0.78))",
    boxShadow: "0 10px 18px rgba(0,122,255,0.18)",
  },
  btnSoft: { color: "#0B1220", background: "rgba(15,23,42,0.06)", border: "1px solid rgba(15,23,42,0.10)" },
  btnGhost: { color: "#0B1220", background: "rgba(255,255,255,0.65)", border: "1px solid rgba(15,23,42,0.10)" },

  chip: {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 12,
    border: "1px solid rgba(15,23,42,0.10)",
    background: "rgba(255,255,255,0.75)",
  },
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

  progressTrack: { height: 6, borderRadius: 999, background: "rgba(15,23,42,0.08)", overflow: "hidden" },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    background:
      "linear-gradient(90deg, rgba(0,122,255,0.95), rgba(175,82,222,0.65), rgba(52,199,89,0.75))",
    boxShadow: "0 6px 16px rgba(0,122,255,0.16)",
  },

  oHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  oTitleRow: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 },
  oIndex: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 44,
    padding: "6px 10px",
    borderRadius: 12,
    background: "rgba(0,122,255,0.12)",
    border: "1px solid rgba(0,122,255,0.18)",
    color: "#0B1220",
    fontWeight: 900,
  },
  oTitleText: { fontWeight: 800, fontSize: 16, color: "#0B1220", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  oMetaRow: { marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  titleInput: {
    width: "min(680px, 70vw)",
    padding: "9px 10px",
    borderRadius: 12,
    border: "1px solid rgba(15,23,42,0.12)",
    background: "rgba(255,255,255,0.90)",
    outline: "none",
    fontWeight: 800,
  },

  krCompactRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 10px",
    borderRadius: 16,
    border: "1px solid rgba(15,23,42,0.10)",
    background: "rgba(255,255,255,0.70)",
  },
  krLeft: { display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0, flex: 1.3 },
  krBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 54,
    height: 28,
    padding: "0 10px",
    borderRadius: 999,
    background: "rgba(15,23,42,0.06)",
    border: "1px solid rgba(15,23,42,0.10)",
    fontWeight: 900,
    color: "rgba(11,18,32,0.85)",
  },
  krTitleText: { fontWeight: 800, color: "#0B1220", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 520 },
  krTitleInput: {
    width: "min(560px, 52vw)",
    padding: "7px 10px",
    borderRadius: 12,
    border: "1px solid rgba(15,23,42,0.12)",
    background: "rgba(255,255,255,0.90)",
    outline: "none",
    fontWeight: 800,
  },
  krSubLine: { marginTop: 6, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  krSubLabel: { fontSize: 12, color: "rgba(11,18,32,0.55)", fontWeight: 700 },
  krSubValue: { fontSize: 12, color: "rgba(11,18,32,0.78)", fontWeight: 800 },
  krMiniInput: {
    width: 120,
    padding: "6px 8px",
    borderRadius: 10,
    border: "1px solid rgba(15,23,42,0.12)",
    background: "rgba(255,255,255,0.90)",
    outline: "none",
    fontSize: 12,
    fontWeight: 800,
  },
  krRight: { display: "flex", alignItems: "center", gap: 10, flex: 1, justifyContent: "flex-end", flexWrap: "wrap" },
  krNums: { display: "flex", gap: 8, alignItems: "center" },
  krNumBlock: { minWidth: 92, padding: "6px 10px", borderRadius: 12, border: "1px solid rgba(15,23,42,0.10)", background: "rgba(15,23,42,0.03)" },
  krNumLabel: { fontSize: 11, color: "rgba(11,18,32,0.55)", fontWeight: 800 },
  krNumValue: { marginTop: 2, fontWeight: 900, color: "#0B1220" },
  krNumInput: {
    width: 92,
    marginTop: 2,
    padding: "6px 8px",
    borderRadius: 10,
    border: "1px solid rgba(15,23,42,0.12)",
    background: "rgba(255,255,255,0.92)",
    outline: "none",
    fontWeight: 900,
  },

  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 12 },
  formRow: { display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" },

  iconBtn: {
    width: 40,
    height: 36,
    borderRadius: 12,
    border: "1px solid rgba(15,23,42,0.10)",
    background: "rgba(255,255,255,0.80)",
    color: "#0B1220",
    cursor: "pointer",
    fontWeight: 900,
  },
  menu: {
    position: "absolute",
    right: 0,
    top: 44,
    minWidth: 170,
    background: "rgba(255,255,255,0.95)",
    border: "1px solid rgba(15,23,42,0.12)",
    borderRadius: 14,
    boxShadow: "0 18px 40px rgba(15,23,42,0.12)",
    padding: 6,
    zIndex: 20,
    backdropFilter: "blur(12px)",
  },
  menuItem: { width: "100%", textAlign: "left", padding: "10px 10px", border: "none", background: "transparent", borderRadius: 12, cursor: "pointer", fontSize: 14, color: "rgba(11,18,32,0.90)", fontWeight: 700 },
  menuItemDanger: { width: "100%", textAlign: "left", padding: "10px 10px", border: "none", background: "transparent", borderRadius: 12, cursor: "pointer", fontSize: 14, color: "rgba(190, 30, 30, 0.95)", fontWeight: 900 },

  modalMask: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.25)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 },
  modal: {
    width: "min(1040px, 96vw)",
    maxHeight: "86vh",
    overflow: "auto",
    background: "rgba(255,255,255,0.92)",
    borderRadius: 18,
    border: "1px solid rgba(15,23,42,0.12)",
    boxShadow: "0 28px 70px rgba(15,23,42,0.18)",
    backdropFilter: "blur(16px)",
  },
  modalHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 12px 10px 12px", borderBottom: "1px solid rgba(15,23,42,0.10)" },
  modalTitle: { fontWeight: 900, color: "#0B1220" },
  modalBody: { padding: 12 },

  checkinRow: { display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 0", borderBottom: "1px solid rgba(15,23,42,0.08)" },

  taskCard: {
    padding: 12,
    borderRadius: 16,
    border: "1px solid rgba(15,23,42,0.10)",
    background: "rgba(255,255,255,0.75)",
  },
  taskTopRow: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" },
  taskBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 44,
    height: 28,
    padding: "0 10px",
    borderRadius: 999,
    background: "rgba(175,82,222,0.10)",
    border: "1px solid rgba(175,82,222,0.18)",
    fontWeight: 900,
  },
  taskTitleText: { fontWeight: 900, color: "#0B1220", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 520 },
  taskTitleInput: {
    width: "min(520px, 60vw)",
    padding: "7px 10px",
    borderRadius: 12,
    border: "1px solid rgba(15,23,42,0.12)",
    background: "rgba(255,255,255,0.92)",
    outline: "none",
    fontWeight: 900,
  },
  taskSubLine: { marginTop: 6, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  taskProgressEdit: { display: "flex", alignItems: "center", gap: 8 },

  taskCheckinBox: { marginTop: 12, paddingTop: 12, borderTop: "1px dashed rgba(15,23,42,0.14)" },

  treeTopBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" },
  zoomBar: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" },
  treeWrap: { position: "relative", overflow: "auto", borderRadius: 18, background: "rgba(255,255,255,0.65)", border: "1px solid rgba(15,23,42,0.10)", height: "72vh" },
  treeWrapFullscreen: { position: "relative", overflow: "auto", borderRadius: 0, background: "rgba(255,255,255,0.92)", border: "none", width: "100%", height: "100%" },
  treeSvg: { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" },
  treeLevel: { position: "relative", display: "flex", justifyContent: "center", zIndex: 1 },
  treeRow: { display: "flex", gap: 24, justifyContent: "center", alignItems: "flex-start", flexWrap: "nowrap" },
  krCol: { display: "flex", flexDirection: "column", gap: 12, minWidth: 260 },
  nodeCard: { width: 260, borderRadius: 18, border: "1px solid rgba(15,23,42,0.10)", background: "rgba(255,255,255,0.80)", padding: 14, boxShadow: "0 10px 26px rgba(15,23,42,0.06)" },
  nodeRoot: { width: 320 },
  nodeTitle: { fontWeight: 900, fontSize: 15, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 },
  nodeGlyph: { display: "inline-flex", width: 26, height: 26, borderRadius: 10, alignItems: "center", justifyContent: "center", background: "rgba(0,122,255,0.10)", border: "1px solid rgba(0,122,255,0.16)", fontWeight: 900 },
  nodeSub: { color: "rgba(11,18,32,0.86)", fontSize: 13, marginBottom: 10, lineHeight: 1.35, maxHeight: 44, overflow: "hidden", textOverflow: "ellipsis" },
  nodeSubSmall: { color: "rgba(11,18,32,0.58)", fontSize: 12 },
  nodeMeta: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, borderTop: "1px solid rgba(15,23,42,0.08)", paddingTop: 10, marginBottom: 10 },
  nodeMetaLeft: { color: "rgba(11,18,32,0.58)", fontSize: 12, fontWeight: 700 },
  nodeProgress: { fontWeight: 900, color: "rgba(11,18,32,0.85)" },

  center: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  loginCard: { width: "min(560px, 92vw)", borderRadius: 22, padding: 18, background: "rgba(255,255,255,0.90)", border: "1px solid rgba(15,23,42,0.10)", boxShadow: "0 30px 70px rgba(15,23,42,0.12)", backdropFilter: "blur(16px)" },
  brandRow: { display: "flex", alignItems: "center", gap: 12 },
  brandMark: { width: 44, height: 44, borderRadius: 16, background: "radial-gradient(circle at 30% 30%, rgba(0,122,255,0.9), rgba(175,82,222,0.75) 55%, rgba(52,199,89,0.55) 100%)", boxShadow: "0 14px 26px rgba(0,122,255,0.16)", border: "1px solid rgba(15,23,42,0.08)" },
  brandTitle: { fontWeight: 950, letterSpacing: 0.3, fontSize: 18 },
  brandSub: { marginTop: 2, fontSize: 12, color: "rgba(11,18,32,0.55)" },

  footer: { marginTop: 16, display: "flex", justifyContent: "center", gap: 10, fontSize: 12, color: "rgba(11,18,32,0.50)" },
};
