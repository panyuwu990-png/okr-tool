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
  const [rows, setRows] = useState([]);
  const [checkins, setCheckins] = useState([]);

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

  // ✅ Futuristic background on body
  useEffect(() => {
    const prevBg = document.body.style.background;
    const prevColor = document.body.style.color;
    document.body.style.background =
      "radial-gradient(1200px 700px at 10% 10%, rgba(88,101,242,0.22), transparent 60%)," +
      "radial-gradient(900px 600px at 90% 15%, rgba(0,255,209,0.18), transparent 55%)," +
      "radial-gradient(1000px 700px at 20% 90%, rgba(255,72,196,0.18), transparent 55%)," +
      "linear-gradient(180deg, #070A16 0%, #070A16 45%, #060816 100%)";
    document.body.style.color = "#EAF2FF";
    document.body.style.margin = "0";
    document.body.style.fontFamily =
      "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Apple Color Emoji, Segoe UI Emoji";
    return () => {
      document.body.style.background = prevBg;
      document.body.style.color = prevColor;
    };
  }, []);

  // 点击空白关闭菜单
  useEffect(() => {
    function onDocClick(e) {
      if (!menuRootRef.current) return;
      if (!menuRootRef.current.contains(e.target)) setMenuOpenKey(null);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

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
    return os.map((o) => ({ ...o, krs: krs.filter((k) => k.parent_id === o.id) }));
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
      return setKRDraft(objectiveId, { error: "目标值必须是 > 0 的数字（例如：26000000）" });
    }
    if (!Number.isFinite(current) || current < 0) {
      return setKRDraft(objectiveId, { error: "当前值必须是 ≥ 0 的数字（空则默认 0）" });
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

    if (!monthFirstDay) return setCheckinDraft(kr.id, { error: "请选择月份（例如：2026-01）" });
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

  // ---------- UI Components ----------
  function Chip({ children, tone = "cyan" }) {
    const t = tone === "pink" ? styles.chipPink : tone === "violet" ? styles.chipViolet : styles.chipCyan;
    return <span style={{ ...styles.chip, ...t }}>{children}</span>;
  }

  function GlowButton({ children, onClick, disabled, variant = "primary", title }) {
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
            <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>{title}</div>
            <GlowButton variant="ghost" onClick={onClose} title="关闭">
              ✕
            </GlowButton>
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

            <GlowButton onClick={() => addCheckin(kr)} disabled={draft.saving}>
              {draft.saving ? "记录中..." : "记录本月复盘"}
            </GlowButton>
          </>
        ) : (
          <div style={styles.muted}>
            只读模式：如需录入/编辑复盘，请先在该 O 右上角点击「修改」进入编辑模式。
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <div style={styles.sectionTitle}>历史复盘</div>

          {history.length ? (
            <div style={{ marginTop: 10 }}>
              {history.map((h) => (
                <div key={h.id} style={styles.checkinRow}>
                  <div style={{ width: 88 }}>
                    <Chip tone="violet">{String(h.month).slice(0, 7)}</Chip>
                  </div>

                  {!isEditing ? (
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                      <div>
                        <span style={styles.muted}>值：</span>
                        <b>{h.value}</b>
                      </div>
                      {h.note ? (
                        <div style={{ maxWidth: 640 }}>
                          <span style={styles.muted}>备注：</span>
                          <span style={{ color: "#DCE7FF" }}>{h.note}</span>
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

  // ---------- Tree View (with Zoom) ----------
  function TreeView({ objectives }) {
    const wrapRef = useRef(null);
    const contentRef = useRef(null);
    const [lines, setLines] = useState([]);
    const nodeRefs = useRef(new Map());
    const [scale, setScale] = useState(1);

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
        setScale((s) => {
          const next = clamp(s + (e.deltaY > 0 ? -0.08 : 0.08), 0.5, 2.0);
          return round2(next);
        });
      }

      el.addEventListener("wheel", onWheel, { passive: false });
      return () => el.removeEventListener("wheel", onWheel);
    }, []);

    function clamp(n, a, b) {
      return Math.max(a, Math.min(b, n));
    }
    function round2(n) {
      return Math.round(n * 100) / 100;
    }

    function zoomIn() {
      setScale((s) => round2(clamp(s + 0.1, 0.5, 2.0)));
    }
    function zoomOut() {
      setScale((s) => round2(clamp(s - 0.1, 0.5, 2.0)));
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
        const next = round2(clamp(Math.min(ratioW, ratioH), 0.5, 2.0));
        setScale(next);
        requestAnimationFrame(() => wrap.scrollTo({ top: 0, left: 0, behavior: "smooth" }));
      });
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
            <div style={styles.h3}>目标关系树</div>
            <div style={styles.muted}>
              提示：按住 Ctrl/⌘ + 滚轮缩放；点击 KR 卡片可打开复盘。
            </div>
          </div>

          <div style={styles.zoomBar}>
            <GlowButton variant="soft" onClick={zoomOut}>
              －
            </GlowButton>
            <Chip tone="cyan">{Math.round(scale * 100)}%</Chip>
            <GlowButton variant="soft" onClick={zoomIn}>
              ＋
            </GlowButton>
            <GlowButton variant="ghost" onClick={fitZoom}>
              适配
            </GlowButton>
            <GlowButton variant="ghost" onClick={resetZoom}>
              重置
            </GlowButton>
          </div>
        </div>

        <div ref={wrapRef} style={styles.treeWrap}>
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
                  stroke="rgba(155, 255, 235, 0.35)"
                  strokeWidth="2"
                />
              ))}
            </svg>

            {/* Root */}
            <div style={styles.treeLevel}>
              <div
                ref={(el) => setRef("root", el)}
                style={{ ...styles.nodeCard, ...styles.nodeRoot }}
              >
                <div style={styles.nodeTitle}>
                  <span style={styles.nodeGlyph}>⟡</span>
                  {root.title}
                </div>
                <div style={styles.nodeSubSmall}>负责人：{ownerLabel(root)}</div>
                <div style={styles.nodeMeta}>
                  <span style={{ color: "rgba(234,242,255,0.72)" }}>类型：公司</span>
                  <span style={styles.nodeProgress}>{rootProgress}%</span>
                </div>
              </div>
            </div>

            {/* O Level */}
            <div style={{ ...styles.treeLevel, marginTop: 26 }}>
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
                        <span style={styles.nodeGlyph}>◈</span>
                        {`O${idx + 1}`}
                      </div>
                      <div style={styles.nodeSub}>{o.title}</div>
                      <div style={styles.nodeSubSmall}>负责人：{ownerLabel(o)}</div>
                      <div style={styles.nodeMeta}>
                        <span style={{ color: "rgba(234,242,255,0.72)" }}>类型：公司</span>
                        <span style={styles.nodeProgress}>{oProgress}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* KR Level */}
            <div style={{ ...styles.treeLevel, marginTop: 26 }}>
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
                            <span style={styles.nodeGlyph}>⟢</span>
                            {`KR${kIdx + 1}`}
                          </div>
                          <div style={styles.nodeSub}>{k.title}</div>
                          <div style={styles.nodeSubSmall}>负责人：{ownerLabel(k)}</div>
                          <div style={styles.nodeMeta}>
                            <span style={{ color: "rgba(234,242,255,0.70)" }}>
                              {k.current_value ?? 0}/{k.target_value ?? "-"}
                            </span>
                            <span style={styles.nodeProgress}>{p}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Subtle scanline overlay */}
          <div style={styles.scanlines} />
        </div>
      </div>
    );
  }

  // ---------- UI ----------
  if (!session) {
    return (
      <div style={styles.center}>
        <div style={styles.loginCard}>
          <div style={styles.brandRow}>
            <div style={styles.brandMark} />
            <div>
              <div style={styles.brandTitle}>OKR Nexus</div>
              <div style={styles.brandSub}>未来感 OKR 协作与复盘系统</div>
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

          <GlowButton onClick={signIn} disabled={authSending}>
            {authSending ? "发送中..." : "发送登录链接"}
          </GlowButton>

          <div style={{ marginTop: 12, ...styles.muted }}>
            * 若没收到邮件，请检查垃圾箱或稍后重试
          </div>
        </div>
      </div>
    );
  }

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

          <GlowButton variant="ghost" onClick={signOut}>
            退出
          </GlowButton>
        </div>
      </div>

      {/* Content */}
      {page === "tree" ? (
        <TreeView objectives={objectives} />
      ) : (
        <>
          {/* Create O */}
          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <div>
                <div style={styles.h3}>新增 Objective</div>
                <div style={styles.muted}>建议：一条 O 配 2–4 条可量化 KR</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {loading ? <Chip tone="violet">同步中</Chip> : <Chip>在线</Chip>}
              </div>
            </div>

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

            <GlowButton onClick={addObjective} disabled={loading}>
              {loading ? "处理中..." : "新增 O"}
            </GlowButton>
          </div>

          {/* List */}
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
                  <div>
                    <div style={styles.oTitle}>
                      <span style={styles.oIndex}>{`O${idx + 1}`}</span>
                      {isEditing ? (
                        <input
                          style={styles.titleInput}
                          defaultValue={o.title}
                          onBlur={(e) => updateTitle(o.id, e.target.value)}
                        />
                      ) : (
                        <span style={{ marginLeft: 10 }}>{o.title}</span>
                      )}
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <Chip tone="violet">负责人：{ownerLabel(o)}</Chip>
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
                    <GlowButton
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
                    </GlowButton>

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

                {/* KR List */}
                {o.krs.length ? (
                  <div style={{ marginTop: 16 }}>
                    <div style={styles.sectionTitle}>关键结果 KR</div>

                    <div style={{ marginTop: 10 }}>
                      {o.krs.map((k, kIdx) => {
                        const progress = calcProgress(k.current_value, k.target_value);
                        const tone = progress >= 80 ? "cyan" : progress >= 40 ? "violet" : "pink";

                        return (
                          <div key={k.id} style={styles.krRow}>
                            <div style={styles.krHeader}>
                              <div style={styles.krTitle}>
                                <span style={styles.krIndex}>{`KR${kIdx + 1}`}</span>
                                {isEditing ? (
                                  <input
                                    style={styles.titleInputSmall}
                                    defaultValue={k.title}
                                    onBlur={(e) => updateTitle(k.id, e.target.value)}
                                  />
                                ) : (
                                  <span style={{ marginLeft: 10 }}>{k.title}</span>
                                )}
                              </div>

                              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                <Chip tone={tone}>进度 {progress}%</Chip>

                                <GlowButton
                                  variant="ghost"
                                  onClick={() => {
                                    setMenuOpenKey(null);
                                    setCheckinModalKr({ kr: k, isEditing });
                                  }}
                                >
                                  复盘
                                </GlowButton>

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

                            {/* KR Meta */}
                            <div style={styles.krMetaGrid}>
                              <div>
                                <div style={styles.label}>主要负责人</div>
                                {isEditing ? (
                                  <input
                                    style={styles.input}
                                    defaultValue={k.main_owner || ""}
                                    placeholder="例如：李四"
                                    onBlur={(e) => updateMainOwner(k.id, e.target.value)}
                                  />
                                ) : (
                                  <div style={styles.metaValue}>{ownerLabel(k)}</div>
                                )}
                              </div>

                              <div>
                                <div style={styles.label}>目标值</div>
                                {isEditing ? (
                                  <input
                                    style={styles.input}
                                    type="number"
                                    defaultValue={k.target_value ?? 0}
                                    onBlur={(e) => updateKRTarget(k.id, e.target.value)}
                                  />
                                ) : (
                                  <div style={styles.metaValue}>{k.target_value ?? "-"}</div>
                                )}
                              </div>

                              <div>
                                <div style={styles.label}>当前值</div>
                                {isEditing ? (
                                  <input
                                    style={styles.input}
                                    type="number"
                                    defaultValue={k.current_value ?? 0}
                                    onBlur={(e) => updateKRCurrent(k.id, e.target.value)}
                                  />
                                ) : (
                                  <div style={styles.metaValue}>{k.current_value ?? 0}</div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 14, ...styles.muted }}>
                    还没有 KR，建议先拆 2–4 个可量化的关键结果。
                  </div>
                )}

                {/* Add KR */}
                {isEditing ? (
                  <div style={{ marginTop: 18, ...styles.subPanel }}>
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

                      <GlowButton onClick={() => addKR(o.id)} disabled={krDraft.saving}>
                        {krDraft.saving ? "新增中..." : "新增 KR"}
                      </GlowButton>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </>
      )}

      {/* Modal */}
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

      {/* Footer vibe */}
      <div style={styles.footer}>
        <span style={{ opacity: 0.75 }}>OKR Nexus</span>
        <span style={{ opacity: 0.55 }}>·</span>
        <span style={{ opacity: 0.65 }}>Futuristic UI</span>
      </div>
    </div>
  );
}

/* ----------------------------- FUTURE UI STYLES ----------------------------- */
const styles = {
  container: {
    maxWidth: 1180,
    margin: "28px auto",
    padding: "0 16px 40px",
  },

  // Topbar
  topbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 18,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
    border: "1px solid rgba(155, 255, 235, 0.18)",
    boxShadow:
      "0 14px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(138,180,255,0.08) inset",
    backdropFilter: "blur(10px)",
    position: "sticky",
    top: 14,
    zIndex: 5,
  },
  logoOrb: {
    width: 38,
    height: 38,
    borderRadius: 14,
    background:
      "radial-gradient(circle at 30% 30%, rgba(0,255,209,0.9), rgba(88,101,242,0.85) 45%, rgba(255,72,196,0.45) 80%)",
    boxShadow:
      "0 0 24px rgba(0,255,209,0.22), 0 0 34px rgba(88,101,242,0.25)",
    border: "1px solid rgba(255,255,255,0.18)",
  },
  appTitle: {
    fontWeight: 900,
    letterSpacing: 0.3,
    fontSize: 18,
    color: "#EAF2FF",
    textShadow: "0 0 18px rgba(88,101,242,0.20)",
  },
  appSub: {
    marginTop: 2,
    fontSize: 12,
    color: "rgba(234,242,255,0.65)",
  },

  tabs: {
    display: "flex",
    gap: 6,
    padding: 6,
    borderRadius: 14,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(155, 255, 235, 0.14)",
    boxShadow: "0 0 0 1px rgba(88,101,242,0.07) inset",
  },
  tab: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid transparent",
    background: "transparent",
    cursor: "pointer",
    fontWeight: 800,
    color: "rgba(234,242,255,0.72)",
  },
  tabActive: {
    padding: "10px 12px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 900,
    color: "#061024",
    border: "1px solid rgba(0,255,209,0.45)",
    background:
      "linear-gradient(90deg, rgba(0,255,209,0.95), rgba(88,101,242,0.95))",
    boxShadow:
      "0 10px 22px rgba(0,255,209,0.14), 0 10px 22px rgba(88,101,242,0.14)",
  },

  // Panels (glass cards)
  panel: {
    marginTop: 16,
    borderRadius: 18,
    padding: 16,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))",
    border: "1px solid rgba(155, 255, 235, 0.16)",
    boxShadow:
      "0 18px 50px rgba(0,0,0,0.50), 0 0 0 1px rgba(138,180,255,0.08) inset",
    backdropFilter: "blur(10px)",
  },
  subPanel: {
    borderRadius: 16,
    padding: 14,
    background: "rgba(8, 12, 28, 0.35)",
    border: "1px dashed rgba(155, 255, 235, 0.22)",
  },
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "flex-start",
  },

  // Typography
  h3: {
    fontWeight: 900,
    fontSize: 16,
    letterSpacing: 0.25,
    marginBottom: 4,
  },
  sectionTitle: {
    fontWeight: 900,
    letterSpacing: 0.2,
    color: "rgba(234,242,255,0.92)",
  },
  muted: {
    color: "rgba(234,242,255,0.62)",
    fontSize: 12,
  },

  // Inputs
  label: {
    fontSize: 12,
    color: "rgba(234,242,255,0.65)",
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  input: {
    width: "100%",
    padding: "11px 12px",
    borderRadius: 14,
    border: "1px solid rgba(155, 255, 235, 0.16)",
    background: "rgba(8, 12, 28, 0.55)",
    color: "#EAF2FF",
    outline: "none",
    boxShadow: "0 0 0 1px rgba(88,101,242,0.08) inset",
  },
  inlineInput: {
    width: 140,
    padding: "9px 10px",
    borderRadius: 14,
    border: "1px solid rgba(155, 255, 235, 0.16)",
    background: "rgba(8, 12, 28, 0.55)",
    color: "#EAF2FF",
    outline: "none",
  },

  // Buttons
  btnBase: {
    border: "none",
    borderRadius: 14,
    padding: "10px 14px",
    fontWeight: 900,
    letterSpacing: 0.2,
    transition: "transform 120ms ease, filter 120ms ease",
  },
  btnPrimary: {
    color: "#061024",
    background:
      "linear-gradient(90deg, rgba(0,255,209,0.95), rgba(88,101,242,0.95), rgba(255,72,196,0.70))",
    boxShadow:
      "0 16px 30px rgba(0,255,209,0.12), 0 16px 30px rgba(88,101,242,0.16), 0 0 0 1px rgba(255,255,255,0.10) inset",
  },
  btnSoft: {
    color: "#EAF2FF",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(155, 255, 235, 0.18)",
    boxShadow: "0 0 0 1px rgba(88,101,242,0.08) inset",
  },
  btnGhost: {
    color: "rgba(234,242,255,0.88)",
    background: "rgba(8, 12, 28, 0.30)",
    border: "1px solid rgba(155, 255, 235, 0.14)",
    boxShadow: "0 0 0 1px rgba(88,101,242,0.06) inset",
  },

  // Chips
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 900,
    fontSize: 12,
    letterSpacing: 0.2,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    boxShadow: "0 0 0 1px rgba(88,101,242,0.06) inset",
  },
  chipCyan: {
    border: "1px solid rgba(0,255,209,0.28)",
    boxShadow: "0 0 18px rgba(0,255,209,0.08)",
    color: "rgba(234,242,255,0.92)",
  },
  chipViolet: {
    border: "1px solid rgba(88,101,242,0.30)",
    boxShadow: "0 0 18px rgba(88,101,242,0.10)",
    color: "rgba(234,242,255,0.92)",
  },
  chipPink: {
    border: "1px solid rgba(255,72,196,0.26)",
    boxShadow: "0 0 18px rgba(255,72,196,0.08)",
    color: "rgba(234,242,255,0.92)",
  },

  // Toast / errors
  toastErr: {
    marginTop: 10,
    marginBottom: 10,
    padding: "10px 12px",
    borderRadius: 14,
    background: "rgba(255, 72, 196, 0.10)",
    border: "1px solid rgba(255, 72, 196, 0.26)",
    color: "#FFD6F0",
    boxShadow: "0 0 26px rgba(255,72,196,0.12)",
    fontWeight: 800,
  },

  // O / KR blocks
  oHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  oTitle: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontWeight: 900,
    fontSize: 16,
    letterSpacing: 0.2,
  },
  oIndex: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 46,
    padding: "6px 10px",
    borderRadius: 14,
    background:
      "linear-gradient(90deg, rgba(88,101,242,0.85), rgba(0,255,209,0.75))",
    color: "#061024",
    boxShadow: "0 0 22px rgba(88,101,242,0.16)",
  },
  titleInput: {
    width: 560,
    maxWidth: "70vw",
    padding: "9px 10px",
    borderRadius: 14,
    border: "1px solid rgba(155, 255, 235, 0.18)",
    background: "rgba(8, 12, 28, 0.55)",
    color: "#EAF2FF",
    outline: "none",
    marginLeft: 8,
    fontWeight: 900,
  },
  titleInputSmall: {
    width: 520,
    maxWidth: "66vw",
    padding: "9px 10px",
    borderRadius: 14,
    border: "1px solid rgba(155, 255, 235, 0.18)",
    background: "rgba(8, 12, 28, 0.55)",
    color: "#EAF2FF",
    outline: "none",
    marginLeft: 8,
    fontWeight: 900,
  },

  krRow: {
    marginTop: 12,
    borderRadius: 18,
    padding: 14,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
    border: "1px solid rgba(88,101,242,0.18)",
    boxShadow:
      "0 14px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,255,209,0.06) inset",
  },
  krHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  krTitle: {
    display: "flex",
    alignItems: "center",
    fontWeight: 900,
    letterSpacing: 0.2,
  },
  krIndex: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 56,
    padding: "6px 10px",
    borderRadius: 14,
    background: "rgba(0,255,209,0.12)",
    border: "1px solid rgba(0,255,209,0.22)",
    color: "#CFFFF3",
    boxShadow: "0 0 18px rgba(0,255,209,0.08)",
  },

  krMetaGrid: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "1.2fr 1fr 1fr",
    gap: 12,
  },
  metaValue: {
    padding: "10px 12px",
    borderRadius: 14,
    background: "rgba(8, 12, 28, 0.38)",
    border: "1px solid rgba(155, 255, 235, 0.12)",
    color: "#EAF2FF",
    fontWeight: 800,
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
    marginTop: 10,
  },

  // Menu
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    border: "1px solid rgba(155, 255, 235, 0.16)",
    background: "rgba(8, 12, 28, 0.35)",
    color: "#EAF2FF",
    cursor: "pointer",
    fontWeight: 900,
    boxShadow: "0 0 0 1px rgba(88,101,242,0.06) inset",
  },
  menu: {
    position: "absolute",
    right: 0,
    top: 48,
    minWidth: 170,
    background: "rgba(8, 12, 28, 0.88)",
    border: "1px solid rgba(155, 255, 235, 0.18)",
    borderRadius: 16,
    boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
    padding: 6,
    zIndex: 20,
    backdropFilter: "blur(10px)",
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
    color: "rgba(234,242,255,0.90)",
    fontWeight: 800,
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
    color: "#FF6BD6",
    fontWeight: 900,
  },

  // Modal
  modalMask: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
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
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
    borderRadius: 18,
    border: "1px solid rgba(155, 255, 235, 0.18)",
    boxShadow:
      "0 26px 70px rgba(0,0,0,0.70), 0 0 0 1px rgba(88,101,242,0.10) inset",
    backdropFilter: "blur(12px)",
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 14px 10px 14px",
    borderBottom: "1px solid rgba(155, 255, 235, 0.10)",
  },
  modalBody: {
    padding: 14,
  },

  // Checkins
  checkinRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "12px 0",
    borderBottom: "1px solid rgba(155, 255, 235, 0.08)",
  },

  // Tree
  treeTopBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
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
    background:
      "radial-gradient(900px 500px at 10% 20%, rgba(0,255,209,0.12), transparent 55%)," +
      "radial-gradient(900px 500px at 90% 10%, rgba(88,101,242,0.14), transparent 60%)," +
      "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
    border: "1px solid rgba(155, 255, 235, 0.14)",
    height: "72vh",
  },
  treeSvg: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  },
  scanlines: {
    pointerEvents: "none",
    position: "absolute",
    inset: 0,
    background:
      "repeating-linear-gradient(180deg, rgba(255,255,255,0.00) 0px, rgba(255,255,255,0.00) 6px, rgba(155,255,235,0.03) 7px)",
    mixBlendMode: "overlay",
    opacity: 0.35,
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
  krCol: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    minWidth: 270,
  },

  // Node cards
  nodeCard: {
    width: 270,
    borderRadius: 18,
    border: "1px solid rgba(155, 255, 235, 0.16)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))",
    padding: 14,
    boxShadow:
      "0 18px 50px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,255,209,0.06) inset",
    backdropFilter: "blur(10px)",
  },
  nodeRoot: {
    width: 330,
    border: "1px solid rgba(0,255,209,0.18)",
    boxShadow:
      "0 22px 60px rgba(0,0,0,0.55), 0 0 40px rgba(0,255,209,0.09), 0 0 0 1px rgba(88,101,242,0.09) inset",
  },
  nodeTitle: {
    fontWeight: 950,
    fontSize: 16,
    marginBottom: 8,
    letterSpacing: 0.25,
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "#EAF2FF",
  },
  nodeGlyph: {
    display: "inline-flex",
    width: 28,
    height: 28,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,255,209,0.10)",
    border: "1px solid rgba(0,255,209,0.18)",
    boxShadow: "0 0 18px rgba(0,255,209,0.10)",
    color: "#CFFFF3",
    fontWeight: 900,
  },
  nodeSub: {
    color: "rgba(234,242,255,0.86)",
    fontSize: 13,
    marginBottom: 10,
    lineHeight: 1.35,
    maxHeight: 44,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  nodeSubSmall: {
    color: "rgba(234,242,255,0.65)",
    fontSize: 12,
    marginTop: 6,
    marginBottom: 10,
  },
  nodeMeta: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    color: "rgba(234,242,255,0.65)",
    fontSize: 12,
    borderTop: "1px solid rgba(155, 255, 235, 0.10)",
    paddingTop: 10,
  },
  nodeProgress: {
    fontWeight: 900,
    color: "#CFFFF3",
    textShadow: "0 0 18px rgba(0,255,209,0.25)",
  },

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
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
    border: "1px solid rgba(155, 255, 235, 0.18)",
    boxShadow:
      "0 28px 70px rgba(0,0,0,0.75), 0 0 0 1px rgba(88,101,242,0.10) inset",
    backdropFilter: "blur(12px)",
  },
  brandRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 16,
    background:
      "radial-gradient(circle at 30% 30%, rgba(255,72,196,0.9), rgba(88,101,242,0.85) 45%, rgba(0,255,209,0.55) 85%)",
    boxShadow:
      "0 0 22px rgba(255,72,196,0.18), 0 0 26px rgba(88,101,242,0.16)",
    border: "1px solid rgba(255,255,255,0.18)",
  },
  brandTitle: {
    fontWeight: 950,
    letterSpacing: 0.4,
    fontSize: 18,
  },
  brandSub: {
    marginTop: 2,
    fontSize: 12,
    color: "rgba(234,242,255,0.65)",
  },

  footer: {
    marginTop: 18,
    display: "flex",
    justifyContent: "center",
    gap: 10,
    fontSize: 12,
    color: "rgba(234,242,255,0.60)",
  },
};
