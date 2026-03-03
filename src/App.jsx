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
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [checkins, setCheckins] = useState([]);

  // New O (collapsed)
  const [showNewO, setShowNewO] = useState(false);
  const [newOTitle, setNewOTitle] = useState("");
  const [newOMainOwner, setNewOMainOwner] = useState("");
  const [newOError, setNewOError] = useState("");

  const [page, setPage] = useState("list"); // "list" | "tree"
  const [editingOId, setEditingOId] = useState(null);

  const [krDrafts, setKrDrafts] = useState({});
  const [checkinDrafts, setCheckinDrafts] = useState({});
  const [checkinModalKr, setCheckinModalKr] = useState(null);

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

  // ---------- Helpers: number format ----------
  const nf = useMemo(() => new Intl.NumberFormat("zh-CN"), []);
  function formatNumber(n) {
    if (n === null || n === undefined || n === "") return "-";
    const num = Number(n);
    if (!Number.isFinite(num)) return String(n);
    return nf.format(num);
  }

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
        supabase
          .from("okr_items")
          .select("*")
          .order("created_at", { ascending: true }),
        supabase
          .from("okr_checkins")
          .select("*")
          .order("created_at", { ascending: true }),
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

    const os = data.filter((i) => i.type === "O");
    const krs = data.filter((i) => i.type === "KR");

    setKrDrafts((prev) => {
      const next = { ...prev };
      for (const o of os) {
        if (!next[o.id])
          next[o.id] = {
            title: "",
            main_owner: "",
            target: "",
            current: "",
            error: "",
            saving: false,
          };
      }
      return next;
    });

    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
    setCheckinDrafts((prev) => {
      const next = { ...prev };
      for (const kr of krs) {
        if (!next[kr.id])
          next[kr.id] = {
            month: ym,
            value: "",
            note: "",
            saving: false,
            error: "",
          };
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

  function ownerLabel(item) {
    const a = (item?.main_owner || "").trim();
    const b = (item?.owner_name || "").trim();
    const c = (item?.owner_email || "").trim();
    return a || b || c || "未设置";
  }

  // ---------- Auth Actions ----------
  // 手机号映射为伪邮箱后缀（要和你在 Supabase Users 里录入的账号一致）
const PHONE_EMAIL_SUFFIX = "okr.local";

function normalizePhone(raw) {
  return String(raw || "")
    .replace(/\s+/g, "")
    .replace(/[^\d]/g, "");
}

function phoneToEmail(phone) {
  return `${phone}@${PHONE_EMAIL_SUFFIX}`;
}

async function signIn() {
  const phone = normalizePhone(email); // 复用你原来的 email state，当作“手机号输入框”
  if (!phone) return alert("请输入手机号");
  if (!password) return alert("请输入密码");

  setAuthSending(true);
  const { error } = await supabase.auth.signInWithPassword({
    email: phoneToEmail(phone),
    password,
  });
  setAuthSending(false);

  if (error) return alert("登录失败：" + (error.message || "unknown error"));
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
      main_owner: (newOMainOwner || "").trim() || null,
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
    setShowNewO(false);
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
    setMenuOpenKey(null);
    if (!confirm(`确认删除：${label}？\n（删除 KR 会连带删除其复盘记录）`)) return;

    const { error } = await supabase.from("okr_items").delete().eq("id", id);
    if (error) return alert("删除失败：" + (error.message || "unknown error"));

    if (editingOId === id) setEditingOId(null);
    if (checkinModalKr?.kr?.id === id) setCheckinModalKr(null);
    await loadAll();
  }

  function setKRDraft(objectiveId, patch) {
    setKrDrafts((prev) => ({
      ...prev,
      [objectiveId]: { ...(prev[objectiveId] || {}), ...patch },
    }));
  }

  async function addKR(objectiveId) {
    const draft =
      krDrafts[objectiveId] || { title: "", main_owner: "", target: "", current: "" };
    const title = (draft.title || "").trim();
    const main_owner = (draft.main_owner || "").trim();
    const target = safeNumber(draft.target);
    const current = safeNumber(draft.current);

    if (!title) return setKRDraft(objectiveId, { error: "请填写 KR 描述" });
    if (!Number.isFinite(target) || target <= 0) {
      return setKRDraft(objectiveId, { error: "目标值必须是 > 0 的数字" });
    }
    if (!Number.isFinite(current) || current < 0) {
      return setKRDraft(objectiveId, { error: "当前值必须是 ≥ 0 的数字" });
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
      main_owner: main_owner || null,
      target_value: target,
      current_value: current,
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
      saving: false,
      error: "",
    });
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

  async function updateKRCurrent(krId, newCurrentRaw) {
    const n = safeNumber(newCurrentRaw);
    if (!Number.isFinite(n) || n < 0) return alert("当前值必须是 ≥ 0 的数字");
    const ok = await updateItem(krId, { current_value: n });
    if (ok) await loadAll();
  }

  async function updateKRTarget(krId, newTargetRaw) {
    const n = safeNumber(newTargetRaw);
    if (!Number.isFinite(n) || n <= 0) return alert("目标值必须是 > 0 的数字");
    const ok = await updateItem(krId, { target_value: n });
    if (ok) await loadAll();
  }

  // ---------- Check-in ----------
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

    if (!monthFirstDay) return setCheckinDraft(kr.id, { error: "请选择月份" });
    if (!Number.isFinite(valueNum) || valueNum < 0) {
      return setCheckinDraft(kr.id, { error: "复盘值必须是 ≥ 0 的数字" });
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

    const { error: insErr } = await supabase
      .from("okr_checkins")
      .upsert(payload, { onConflict: "kr_id,month" });

    if (insErr) {
      setCheckinDraft(kr.id, {
        saving: false,
        error: "记录失败：" + (insErr.message || "unknown"),
      });
      return;
    }

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
    setMenuOpenKey(null);
    if (!confirm("确认删除这条复盘记录？")) return;
    const { error } = await supabase.from("okr_checkins").delete().eq("id", id);
    if (error) return alert("删除失败：" + (error.message || "unknown error"));
    await loadAll();
  }

  // ---------- UI ----------
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

  function CheckinPanel({ kr, isEditing, history, draft }) {
    return (
      <div>
        {isEditing ? (
          <>
            <div style={styles.grid3}>
              <div>
                <div style={styles.label}>月份</div>
                <input
                  style={styles.input}
                  type="month"
                  value={draft.month}
                  onChange={(e) => setCheckinDraft(kr.id, { month: e.target.value })}
                />
              </div>
              <div>
                <div style={styles.label}>本月实际值</div>
                <input
                  style={styles.input}
                  type="number"
                  placeholder="例如：5000000"
                  value={draft.value}
                  onChange={(e) => setCheckinDraft(kr.id, { value: e.target.value })}
                />
              </div>
              <div>
                <div style={styles.label}>备注（可选）</div>
                <input
                  style={styles.input}
                  placeholder="例如：本月投放加码，ROI 提升"
                  value={draft.note}
                  onChange={(e) => setCheckinDraft(kr.id, { note: e.target.value })}
                />
              </div>
            </div>

            {draft.error ? <div style={styles.toastErr}>{draft.error}</div> : null}

            <Button onClick={() => addCheckin(kr)} disabled={draft.saving}>
              {draft.saving ? "记录中..." : "记录本月复盘"}
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
                          const n = safeNumber(e.target.value);
                          if (!Number.isFinite(n) || n < 0) return alert("复盘值必须 ≥ 0");
                          const ok = await updateCheckin(h.id, { value: n });
                          if (ok) await loadAll();
                        }}
                      />

                      <span style={styles.muted}>备注：</span>
                      <input
                        style={{ ...styles.inlineInput, width: 360 }}
                        defaultValue={h.note || ""}
                        onBlur={async (e) => {
                          const ok = await updateCheckin(h.id, { note: e.target.value });
                          if (ok) await loadAll();
                        }}
                      />

                      <MoreMenu
                        menuKey={`ck:${h.id}`}
                        items={[{ label: "删除复盘", danger: true, onClick: () => deleteCheckin(h.id) }]}
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
    );
  }

  // ---------- Tree View (Zoom + Fullscreen) ----------
  function TreeView({ objectives }) {
    const wrapRef = useRef(null);
    const contentRef = useRef(null);
    const [lines, setLines] = useState([]);
    const nodeRefs = useRef(new Map());
    const [scale, setScale] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const root = useMemo(
      () => ({ id: "root", title: "26年年度OKR", type: "ROOT", main_owner: "公司" }),
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

    // fullscreen state tracking
    useEffect(() => {
      function onFsChange() {
        const fsEl = document.fullscreenElement;
        setIsFullscreen(!!fsEl);
        // fullscreen 切换后线条需要重算
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
        } catch (e) {
          alert("进入全屏失败（浏览器可能限制）");
        }
      } else {
        await document.exitFullscreen();
      }
    }

    const allKrs = objectives.flatMap((o) => o.krs || []);
    const rootProgress =
      allKrs.length === 0
        ? 0
        : Math.round(
            allKrs.reduce((acc, k) => acc + calcProgress(k.current_value, k.target_value), 0) /
              allKrs.length
          );

    return (
      <div style={styles.panel}>
        <div style={styles.treeTopBar}>
          <div>
            <div style={styles.h3}>关系树</div>
            <div style={styles.muted}>Ctrl/⌘ + 滚轮缩放；点击 KR 可打开复盘</div>
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
                  <span style={styles.nodeProgress}>{rootProgress}%</span>
                </div>
                <ProgressBar value={Math.min(100, rootProgress)} />
              </div>
            </div>

            {/* O Level */}
            <div style={{ ...styles.treeLevel, marginTop: 20 }}>
              <div style={styles.treeRow}>
                {objectives.map((o, idx) => {
                  const oProgress =
                    o.krs?.length
                      ? Math.round(
                          o.krs.reduce(
                            (acc, k) => acc + calcProgress(k.current_value, k.target_value),
                            0
                          ) / o.krs.length
                        )
                      : 0;

                  return (
                    <div
                      key={o.id}
                      ref={(el) => setRef(`o:${o.id}`, el)}
                      style={styles.nodeCard}
                      title={o.title}
                    >
                      <div style={styles.nodeTitle}>
                        <span style={styles.nodeGlyph}>O</span>
                        {`O${idx + 1}`}
                      </div>
                      <div style={styles.nodeSub}>{o.title}</div>
                      <div style={styles.nodeSubSmall}>负责人：{ownerLabel(o)}</div>
                      <div style={styles.nodeMeta}>
                        <span style={styles.nodeMetaLeft}>公司</span>
                        <span style={styles.nodeProgress}>{oProgress}%</span>
                      </div>
                      <ProgressBar value={Math.min(100, oProgress)} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* KR Level */}
            <div style={{ ...styles.treeLevel, marginTop: 20 }}>
              <div style={styles.treeRow}>
                {objectives.map((o) => (
                  <div key={o.id} style={styles.krCol}>
                    {(o.krs || []).map((k, kIdx) => {
                      const p = calcProgress(k.current_value, k.target_value);
                      return (
                        <div
                          key={k.id}
                          ref={(el) => setRef(`kr:${k.id}`, el)}
                          style={{ ...styles.nodeCard, cursor: "pointer" }}
                          onClick={() => setCheckinModalKr({ kr: k, isEditing: false })}
                          title="点击打开复盘"
                        >
                          <div style={styles.nodeTitle}>
                            <span style={styles.nodeGlyph}>K</span>
                            {`KR${kIdx + 1}`}
                          </div>
                          <div style={styles.nodeSub}>{k.title}</div>
                          <div style={styles.nodeSubSmall}>负责人：{ownerLabel(k)}</div>
                          <div style={styles.nodeMeta}>
                            <span style={styles.nodeMetaLeft}>
                              {formatNumber(k.current_value ?? 0)}/{formatNumber(k.target_value ?? 0)}
                            </span>
                            <span style={styles.nodeProgress}>{p}%</span>
                          </div>
                          <ProgressBar value={Math.min(100, p)} />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Auth Page ----------
  // ---------- Auth Page ----------
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
          <div style={styles.muted}>手机号 + 密码</div>
        </div>

        {/* 手机号：复用 email state */}
        <input
          style={styles.input}
          placeholder="输入手机号+尾缀（例如：13800138000 + cia.com）"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          inputMode="numeric"
        />

        {/* 密码 */}
        <input
          style={styles.input}
          placeholder="输入密码"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") signIn();
          }}
        />

        <Button onClick={signIn} disabled={authSending}>
          {authSending ? "登录中..." : "登录"}
        </Button>

        <div style={{ marginTop: 12, ...styles.muted }}>
          账号规则：手机号@{PHONE_EMAIL_SUFFIX}（由管理员预录入）
        </div>
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
            <div style={styles.appSub}>O → KR · 月度复盘 · 关系树</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={styles.tabs}>
            <button
              style={page === "list" ? styles.tabActive : styles.tab}
              onClick={() => setPage("list")}
            >
              列表
            </button>
            <button
              style={page === "tree" ? styles.tabActive : styles.tab}
              onClick={() => setPage("tree")}
            >
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
                <div style={styles.muted}>建议：一条 O 配 2–4 条可量化 KR</div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {loading ? <Chip tone="violet">同步中</Chip> : <Chip tone="gray">在线</Chip>}
                <Button
                  variant={showNewO ? "soft" : "primary"}
                  onClick={() => setShowNewO((v) => !v)}
                >
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
                      {isEditing ? (
                        <span style={styles.muted}>（编辑负责人：输入后点空白处保存）</span>
                      ) : null}
                    </div>

                    {isEditing ? (
                      <div style={{ marginTop: 10, maxWidth: 360 }}>
                        <div style={styles.label}>主要负责人（可修改）</div>
                        <input
                          style={styles.input}
                          defaultValue={o.main_owner || ""}
                          placeholder="例如：张三"
                          onBlur={(e) => updateMainOwner(o.id, e.target.value)}
                        />
                      </div>
                    ) : null}
                  </div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <Button
                      variant={isEditing ? "soft" : "primary"}
                      onClick={() => {
                        setMenuOpenKey(null);
                        setEditingOId(isEditing ? null : o.id);
                        if (isEditing && checkinModalKr) {
                          setCheckinModalKr({ ...checkinModalKr, isEditing: false });
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

                {/* KR Compact List */}
                <div style={{ marginTop: 12 }}>
                  <div style={styles.sectionTitle}>KR</div>

                  {o.krs.length ? (
                    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                      {o.krs.map((k, kIdx) => {
                        const progress = calcProgress(k.current_value, k.target_value);

                        const tone =
                          progress >= 80 ? "green" : progress >= 40 ? "blue" : "violet";

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
                                </div>
                              </div>
                            </div>

                            <div style={styles.krRight}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 180 }}>
                                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                  <Chip tone={tone}>进度 {progress}%</Chip>
                                </div>
                                <ProgressBar value={Math.min(100, progress)} />
                              </div>

                              <div style={styles.krNums}>
                                <div style={styles.krNumBlock}>
                                  <div style={styles.krNumLabel}>目标</div>
                                  {isEditing ? (
                                    <input
                                      style={styles.krNumInput}
                                      type="number"
                                      defaultValue={k.target_value ?? 0}
                                      onBlur={(e) => updateKRTarget(k.id, e.target.value)}
                                    />
                                  ) : (
                                    <div style={styles.krNumValue}>{formatNumber(k.target_value ?? 0)}</div>
                                  )}
                                </div>

                                <div style={styles.krNumBlock}>
                                  <div style={styles.krNumLabel}>当前</div>
                                  {isEditing ? (
                                    <input
                                      style={styles.krNumInput}
                                      type="number"
                                      defaultValue={k.current_value ?? 0}
                                      onBlur={(e) => updateKRCurrent(k.id, e.target.value)}
                                    />
                                  ) : (
                                    <div style={styles.krNumValue}>{formatNumber(k.current_value ?? 0)}</div>
                                  )}
                                </div>
                              </div>

                              <Button
                                variant="ghost"
                                onClick={() => {
                                  setMenuOpenKey(null);
                                  setCheckinModalKr({ kr: k, isEditing });
                                }}
                              >
                                复盘
                              </Button>

                              {isEditing ? (
                                <MoreMenu
                                  menuKey={`kr:${k.id}`}
                                  items={[
                                    {
                                      label: "删除 KR",
                                      danger: true,
                                      onClick: () => deleteItem(k.id, `KR${kIdx + 1}`),
                                    },
                                  ]}
                                />
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ marginTop: 10, ...styles.muted }}>
                      还没有 KR（建议先拆 2–4 条可量化 KR）
                    </div>
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
                      </div>

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

      {/* Checkin Modal */}
      <Modal
        open={!!checkinModalKr}
        title={
          checkinModalKr
            ? `月度复盘｜${checkinModalKr.kr.title}（负责人：${ownerLabel(checkinModalKr.kr)}）`
            : ""
        }
        onClose={() => setCheckinModalKr(null)}
      >
        {checkinModalKr ? (
          <CheckinPanel
            kr={checkinModalKr.kr}
            isEditing={checkinModalKr.isEditing}
            history={(checkinsByKr[checkinModalKr.kr.id] || []).slice().reverse()}
            draft={
              checkinDrafts[checkinModalKr.kr.id] || {
                month: "",
                value: "",
                note: "",
                saving: false,
                error: "",
              }
            }
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
  appTitle: {
    fontWeight: 800,
    letterSpacing: 0.2,
    fontSize: 16,
    color: "#0B1220",
  },
  appSub: {
    marginTop: 2,
    fontSize: 12,
    color: "rgba(11,18,32,0.55)",
  },

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
  h3: {
    fontWeight: 800,
    fontSize: 15,
    margin: 0,
  },
  sectionTitle: {
    fontWeight: 800,
    color: "rgba(11,18,32,0.92)",
  },
  muted: {
    color: "rgba(11,18,32,0.56)",
    fontSize: 12,
  },

  // Inputs
  label: {
    fontSize: 12,
    color: "rgba(11,18,32,0.62)",
    marginBottom: 6,
  },
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

  // Buttons (Tahoe)
  btnBase: {
    border: "1px solid transparent",
    borderRadius: 12,
    padding: "10px 12px",
    fontWeight: 800,
    transition: "transform 100ms ease, box-shadow 120ms ease",
  },
  btnPrimary: {
    color: "#ffffff",
    background: "linear-gradient(180deg, rgba(0,122,255,0.95), rgba(0,122,255,0.78))",
    boxShadow: "0 10px 18px rgba(0,122,255,0.18)",
  },
  btnSoft: {
    color: "#0B1220",
    background: "rgba(15,23,42,0.06)",
    border: "1px solid rgba(15,23,42,0.10)",
  },
  btnGhost: {
    color: "#0B1220",
    background: "rgba(255,255,255,0.65)",
    border: "1px solid rgba(15,23,42,0.10)",
  },

  // Chips
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

  // Progress bar (thin, macOS style)
  progressTrack: {
    height: 6,
    borderRadius: 999,
    background: "rgba(15,23,42,0.08)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    background:
      "linear-gradient(90deg, rgba(0,122,255,0.95), rgba(175,82,222,0.65), rgba(52,199,89,0.75))",
    boxShadow: "0 6px 16px rgba(0,122,255,0.16)",
  },

  // O header
  oHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  oTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
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
  oTitleText: {
    fontWeight: 800,
    fontSize: 16,
    color: "#0B1220",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  oMetaRow: {
    marginTop: 10,
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },
  titleInput: {
    width: "min(680px, 70vw)",
    padding: "9px 10px",
    borderRadius: 12,
    border: "1px solid rgba(15,23,42,0.12)",
    background: "rgba(255,255,255,0.90)",
    outline: "none",
    fontWeight: 800,
  },

  // Compact KR row
  krCompactRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 10px",
    borderRadius: 16,
    border: "1px solid rgba(15,23,42,0.10)",
    background: "rgba(255,255,255,0.70)",
  },
  krLeft: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    minWidth: 0,
    flex: 1.3,
  },
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
  krTitleText: {
    fontWeight: 800,
    color: "#0B1220",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: 520,
  },
  krTitleInput: {
    width: "min(560px, 52vw)",
    padding: "7px 10px",
    borderRadius: 12,
    border: "1px solid rgba(15,23,42,0.12)",
    background: "rgba(255,255,255,0.90)",
    outline: "none",
    fontWeight: 800,
  },
  krSubLine: {
    marginTop: 6,
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  krSubLabel: {
    fontSize: 12,
    color: "rgba(11,18,32,0.55)",
    fontWeight: 700,
  },
  krSubValue: {
    fontSize: 12,
    color: "rgba(11,18,32,0.78)",
    fontWeight: 800,
  },
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
  krRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flex: 1,
    justifyContent: "flex-end",
    flexWrap: "wrap",
  },
  krNums: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  krNumBlock: {
    minWidth: 92,
    padding: "6px 10px",
    borderRadius: 12,
    border: "1px solid rgba(15,23,42,0.10)",
    background: "rgba(15,23,42,0.03)",
  },
  krNumLabel: {
    fontSize: 11,
    color: "rgba(11,18,32,0.55)",
    fontWeight: 800,
  },
  krNumValue: {
    marginTop: 2,
    fontWeight: 900,
    color: "#0B1220",
  },
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

  // Layout helpers
  grid2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  grid3: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 2fr",
    gap: 12,
  },
  formRow: {
    display: "flex",
    gap: 12,
    alignItems: "flex-end",
    flexWrap: "wrap",
  },

  // Menu
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
  menuItem: {
    width: "100%",
    textAlign: "left",
    padding: "10px 10px",
    border: "none",
    background: "transparent",
    borderRadius: 12,
    cursor: "pointer",
    fontSize: 14,
    color: "rgba(11,18,32,0.90)",
    fontWeight: 700,
  },
  menuItemDanger: {
    width: "100%",
    textAlign: "left",
    padding: "10px 10px",
    border: "none",
    background: "transparent",
    borderRadius: 12,
    cursor: "pointer",
    fontSize: 14,
    color: "rgba(190, 30, 30, 0.95)",
    fontWeight: 900,
  },

  // Modal
  modalMask: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 50,
  },
  modal: {
    width: "min(980px, 96vw)",
    maxHeight: "86vh",
    overflow: "auto",
    background: "rgba(255,255,255,0.92)",
    borderRadius: 18,
    border: "1px solid rgba(15,23,42,0.12)",
    boxShadow: "0 28px 70px rgba(15,23,42,0.18)",
    backdropFilter: "blur(16px)",
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 12px 10px 12px",
    borderBottom: "1px solid rgba(15,23,42,0.10)",
  },
  modalTitle: {
    fontWeight: 900,
    color: "#0B1220",
  },
  modalBody: { padding: 12 },

  // Checkins
  checkinRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "12px 0",
    borderBottom: "1px solid rgba(15,23,42,0.08)",
  },

  // Tree
  treeTopBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  zoomBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  treeWrap: {
    position: "relative",
    overflow: "auto",
    borderRadius: 18,
    background: "rgba(255,255,255,0.65)",
    border: "1px solid rgba(15,23,42,0.10)",
    height: "72vh",
  },
  treeWrapFullscreen: {
    position: "relative",
    overflow: "auto",
    borderRadius: 0,
    background: "rgba(255,255,255,0.92)",
    border: "none",
    width: "100%",
    height: "100%",
  },
  treeSvg: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  },
  treeLevel: {
    position: "relative",
    display: "flex",
    justifyContent: "center",
    zIndex: 1,
  },
  treeRow: {
    display: "flex",
    gap: 24,
    justifyContent: "center",
    alignItems: "flex-start",
    flexWrap: "nowrap",
  },
  krCol: { display: "flex", flexDirection: "column", gap: 12, minWidth: 260 },

  nodeCard: {
    width: 260,
    borderRadius: 18,
    border: "1px solid rgba(15,23,42,0.10)",
    background: "rgba(255,255,255,0.80)",
    padding: 14,
    boxShadow: "0 10px 26px rgba(15,23,42,0.06)",
  },
  nodeRoot: { width: 320 },
  nodeTitle: {
    fontWeight: 900,
    fontSize: 15,
    marginBottom: 8,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  nodeGlyph: {
    display: "inline-flex",
    width: 26,
    height: 26,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,122,255,0.10)",
    border: "1px solid rgba(0,122,255,0.16)",
    fontWeight: 900,
  },
  nodeSub: {
    color: "rgba(11,18,32,0.86)",
    fontSize: 13,
    marginBottom: 10,
    lineHeight: 1.35,
    maxHeight: 44,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  nodeSubSmall: { color: "rgba(11,18,32,0.58)", fontSize: 12 },
  nodeMeta: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    borderTop: "1px solid rgba(15,23,42,0.08)",
    paddingTop: 10,
    marginBottom: 10,
  },
  nodeMetaLeft: { color: "rgba(11,18,32,0.58)", fontSize: 12, fontWeight: 700 },
  nodeProgress: { fontWeight: 900, color: "rgba(11,18,32,0.85)" },

  // Login
  center: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loginCard: {
    width: "min(560px, 92vw)",
    borderRadius: 22,
    padding: 18,
    background: "rgba(255,255,255,0.90)",
    border: "1px solid rgba(15,23,42,0.10)",
    boxShadow: "0 30px 70px rgba(15,23,42,0.12)",
    backdropFilter: "blur(16px)",
  },
  brandRow: { display: "flex", alignItems: "center", gap: 12 },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 16,
    background:
      "radial-gradient(circle at 30% 30%, rgba(0,122,255,0.9), rgba(175,82,222,0.75) 55%, rgba(52,199,89,0.55) 100%)",
    boxShadow: "0 14px 26px rgba(0,122,255,0.16)",
    border: "1px solid rgba(15,23,42,0.08)",
  },
  brandTitle: { fontWeight: 950, letterSpacing: 0.3, fontSize: 18 },
  brandSub: { marginTop: 2, fontSize: 12, color: "rgba(11,18,32,0.55)" },

  footer: {
    marginTop: 16,
    display: "flex",
    justifyContent: "center",
    gap: 10,
    fontSize: 12,
    color: "rgba(11,18,32,0.50)",
  },
};
