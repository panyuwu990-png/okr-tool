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
  const [newOError, setNewOError] = useState("");

  // ✅ 页面切换：列表 / 关系树
  const [page, setPage] = useState("list"); // "list" | "tree"

  // 当前正在编辑的 Objective
  const [editingOId, setEditingOId] = useState(null);

  // 每个 O 独立的 KR 草稿
  const [krDrafts, setKrDrafts] = useState({});

  // 每个 KR 独立的月度复盘草稿
  const [checkinDrafts, setCheckinDrafts] = useState({});

  // ✅ 复盘弹层：当前打开的 KR
  const [checkinModalKr, setCheckinModalKr] = useState(null); // { kr, isEditing } | null

  // 统一的“更多菜单”状态：o:<oid> / kr:<krid> / ck:<checkinid>
  const [menuOpenKey, setMenuOpenKey] = useState(null);
  const menuRootRef = useRef(null);

  // 点击空白关闭菜单
  useEffect(() => {
    function onDocClick(e) {
      if (!menuRootRef.current) return;
      if (!menuRootRef.current.contains(e.target)) {
        setMenuOpenKey(null);
      }
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

    // 初始化草稿
    const os = data.filter((i) => i.type === "O");
    const krs = data.filter((i) => i.type === "KR");

    setKrDrafts((prev) => {
      const next = { ...prev };
      for (const o of os) {
        if (!next[o.id])
          next[o.id] = {
            title: "",
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
          next[kr.id] = { month: ym, value: "", note: "", saving: false, error: "" };
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
    setMenuOpenKey(null);
    if (!confirm(`确认删除：${label}？\n（删除 KR 会连带删除其复盘记录）`))
      return;

    const { error } = await supabase.from("okr_items").delete().eq("id", id);
    if (error) {
      alert("删除失败：" + (error.message || "unknown error"));
      return;
    }

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
      setKRDraft(objectiveId, {
        saving: false,
        error: "新增 KR 失败：" + (error.message || "unknown"),
      });
      return;
    }

    setKRDraft(objectiveId, {
      title: "",
      target: "",
      current: "",
      saving: false,
      error: "",
    });
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
      await loadAll();
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
      setCheckinDraft(kr.id, {
        saving: false,
        error: "复盘已记，但更新当前值失败",
      });
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

  // ---------- UI Small Components ----------
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
            <div style={{ fontWeight: 800 }}>{title}</div>
            <button style={styles.modalClose} onClick={onClose} title="关闭">
              ✕
            </button>
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
                  onChange={(e) =>
                    setCheckinDraft(kr.id, { month: e.target.value })
                  }
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

            {draft.error ? <div style={styles.error}>{draft.error}</div> : null}

            <button
              style={styles.button}
              onClick={() => addCheckin(kr)}
              disabled={draft.saving}
            >
              {draft.saving ? "记录中..." : "记录本月复盘"}
            </button>
          </>
        ) : (
          <div style={{ color: "#6b7280", fontSize: 12 }}>
            只读模式：如需录入/编辑复盘，请先在该 O 右上角点击「修改」进入编辑模式。
          </div>
        )}

        <div style={{ marginTop: 14, color: "#6b7280", fontSize: 12 }}>历史复盘：</div>

        {history.length ? (
          <div style={{ marginTop: 8 }}>
            {history.map((h) => (
              <div key={h.id} style={styles.checkinRow}>
                <b style={{ width: 80, display: "inline-block" }}>
                  {String(h.month).slice(0, 7)}
                </b>

                {!isEditing ? (
                  <>
                    <span style={{ marginLeft: 8 }}>值：{h.value}</span>
                    {h.note ? (
                      <span style={{ marginLeft: 10, color: "#6b7280" }}>
                        备注：{h.note}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <>
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
                      style={{ ...styles.inlineInput, width: 320 }}
                      defaultValue={h.note || ""}
                      onBlur={async (e) => {
                        const ok = await updateCheckin(h.id, { note: e.target.value });
                        if (ok) await loadAll();
                      }}
                    />

                    <MoreMenu
                      menuKey={`ck:${h.id}`}
                      items={[
                        { label: "删除复盘", danger: true, onClick: () => deleteCheckin(h.id) },
                      ]}
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 8, fontSize: 13, color: "#6b7280" }}>暂无复盘记录</div>
        )}
      </div>
    );
  }

  // ---------- Tree View (关系树) ----------
  function TreeView({ objectives }) {
    const wrapRef = useRef(null);
    const [lines, setLines] = useState([]);

    const nodeRefs = useRef(new Map()); // key -> element

    const root = useMemo(() => {
      // 你可以改成“2026年年度OKR”
      return { id: "root", title: "26年年度OKR", type: "ROOT" };
    }, []);

    function setRef(key, el) {
      if (!key) return;
      if (el) nodeRefs.current.set(key, el);
      else nodeRefs.current.delete(key);
    }

    function calcCenter(el) {
      const r = el.getBoundingClientRect();
      const wr = wrapRef.current.getBoundingClientRect();
      return {
        x: r.left - wr.left + r.width / 2,
        y: r.top - wr.top + r.height / 2,
        top: r.top - wr.top,
        bottom: r.bottom - wr.top,
      };
    }

    function recomputeLines() {
      if (!wrapRef.current) return;
      const newLines = [];

      // root -> each O
      for (const o of objectives) {
        const rootEl = nodeRefs.current.get(`root`);
        const oEl = nodeRefs.current.get(`o:${o.id}`);
        if (!rootEl || !oEl) continue;

        const a = calcCenter(rootEl);
        const b = calcCenter(oEl);
        newLines.push({
          x1: a.x,
          y1: a.bottom,
          x2: b.x,
          y2: b.top,
        });

        // O -> each KR
        for (const kr of o.krs) {
          const krEl = nodeRefs.current.get(`kr:${kr.id}`);
          if (!krEl) continue;
          const c = calcCenter(oEl);
          const d = calcCenter(krEl);
          newLines.push({
            x1: c.x,
            y1: c.bottom,
            x2: d.x,
            y2: d.top,
          });
        }
      }

      setLines(newLines);
    }

    useLayoutEffect(() => {
      recomputeLines();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [objectives]);

    useEffect(() => {
      function onResize() {
        recomputeLines();
      }
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 计算 root 的进度：可简单用所有 KR 平均进度（可按需改）
    const allKrs = objectives.flatMap((o) => o.krs || []);
    const rootProgress =
      allKrs.length === 0
        ? 0
        : Math.round(
            allKrs.reduce(
              (acc, k) => acc + calcProgress(k.current_value, k.target_value),
              0
            ) / allKrs.length
          );

    return (
      <div style={styles.treeOuter}>
        <div style={styles.treeHint}>
          提示：点击 KR 卡片可打开“复盘”弹层（查看/录入需先在列表页对该 O 点“修改”）。
        </div>

        <div ref={wrapRef} style={styles.treeWrap}>
          {/* SVG 连线层 */}
          <svg style={styles.treeSvg}>
            {lines.map((ln, i) => (
              <line
                key={i}
                x1={ln.x1}
                y1={ln.y1}
                x2={ln.x2}
                y2={ln.y2}
                stroke="#d1d5db"
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
              <div style={styles.nodeTitle}>{root.title}</div>
              <div style={styles.nodeMeta}>
                目标类型：公司
                <span style={{ float: "right", fontWeight: 700 }}>{rootProgress}%</span>
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
                    style={{ ...styles.nodeCard, minWidth: 260 }}
                    title={o.title}
                  >
                    <div style={styles.nodeTitle}>{`O${idx + 1}`}</div>
                    <div style={styles.nodeSub}>{o.title}</div>
                    <div style={styles.nodeMeta}>
                      目标类型：公司
                      <span style={{ float: "right", fontWeight: 700 }}>
                        {oProgress}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* KR Level: 每个 O 的 KR 一列 */}
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
                        <div style={styles.nodeTitle}>{`KR${kIdx + 1}`}</div>
                        <div style={styles.nodeSub}>{k.title}</div>
                        <div style={styles.nodeMeta}>
                          <span style={{ color: "#6b7280" }}>
                            {k.current_value ?? 0}/{k.target_value ?? "-"}
                          </span>
                          <span style={{ float: "right", fontWeight: 700 }}>{p}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
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
    <div style={styles.container} ref={menuRootRef}>
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ margin: 0 }}>OKR（O → KR）</h2>

          {/* ✅ 页面切换 */}
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
        </div>

        <button style={styles.link} onClick={signOut}>
          退出
        </button>
      </div>

      {page === "tree" ? (
        <TreeView objectives={objectives} />
      ) : (
        <>
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
            const isEditing = editingOId === o.id;
            const krDraft =
              krDrafts[o.id] || {
                title: "",
                target: "",
                current: "",
                error: "",
                saving: false,
              };

            return (
              <div key={o.id} style={styles.card}>
                {/* O Header */}
                <div style={styles.oHeader}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>
                    {`O${idx + 1}：`}
                    {isEditing ? (
                      <input
                        style={styles.titleInput}
                        defaultValue={o.title}
                        onBlur={(e) => updateTitle(o.id, e.target.value)}
                      />
                    ) : (
                      <span>{o.title}</span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      style={styles.secondary}
                      onClick={() => {
                        setMenuOpenKey(null);
                        setEditingOId(isEditing ? null : o.id);

                        // 如果从编辑切回只读，弹层还开着，也切回只读
                        if (isEditing && checkinModalKr) {
                          setCheckinModalKr({ ...checkinModalKr, isEditing: false });
                        }
                      }}
                    >
                      {isEditing ? "完成" : "修改"}
                    </button>

                    {/* 更多：只在编辑模式显示 */}
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
                  <div style={{ marginTop: 12, marginBottom: 12 }}>
                    {o.krs.map((k, kIdx) => {
                      const progress = calcProgress(k.current_value, k.target_value);

                      return (
                        <div key={k.id} style={styles.krRow}>
                          <div style={styles.krHeader}>
                            <div style={{ fontWeight: 800 }}>
                              {`KR${kIdx + 1}：`}
                              {isEditing ? (
                                <input
                                  style={styles.titleInputSmall}
                                  defaultValue={k.title}
                                  onBlur={(e) => updateTitle(k.id, e.target.value)}
                                />
                              ) : (
                                <span>{k.title}</span>
                              )}
                            </div>

                            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                              <div style={{ color: "#6b7280", fontSize: 12 }}>
                                {`进度 ${progress}%`}
                              </div>

                              {/* 复盘按钮：打开弹层 */}
                              <button
                                style={styles.ghost}
                                onClick={() => {
                                  setMenuOpenKey(null);
                                  setCheckinModalKr({ kr: k, isEditing });
                                }}
                              >
                                复盘
                              </button>

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

                          {/* Target/Current */}
                          <div style={styles.krMeta}>
                            <span>目标：</span>
                            {isEditing ? (
                              <input
                                style={styles.inlineInput}
                                type="number"
                                defaultValue={k.target_value ?? 0}
                                onBlur={(e) => updateKRTarget(k.id, e.target.value)}
                              />
                            ) : (
                              <b>{k.target_value ?? "-"}</b>
                            )}

                            <span style={{ marginLeft: 10 }}>当前：</span>
                            {isEditing ? (
                              <input
                                style={styles.inlineInput}
                                type="number"
                                defaultValue={k.current_value ?? 0}
                                onBlur={(e) => updateKRCurrent(k.id, e.target.value)}
                              />
                            ) : (
                              <b>{k.current_value ?? 0}</b>
                            )}

                            {isEditing ? (
                              <span style={{ marginLeft: 8, color: "#6b7280", fontSize: 12 }}>
                                （改完点空白处自动保存）
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div
                    style={{
                      color: "#6b7280",
                      fontSize: 13,
                      marginTop: 10,
                      marginBottom: 12,
                    }}
                  >
                    还没有 KR，建议先拆 2–4 个可量化的关键结果。
                  </div>
                )}

                {/* 新增 KR：只在编辑模式显示 */}
                {isEditing ? (
                  <div style={styles.subCard}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>新增 KR</div>
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

                    <button
                      style={styles.button}
                      onClick={() => addKR(o.id)}
                      disabled={krDraft.saving}
                    >
                      {krDraft.saving ? "新增中..." : "新增 KR"}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </>
      )}

      {/* ✅ 复盘弹层（列表页/树状页都可打开） */}
      <Modal
        open={!!checkinModalKr}
        title={checkinModalKr ? `月度复盘｜${checkinModalKr.kr.title}` : ""}
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
    maxWidth: 1100,
    margin: "40px auto",
    padding: 16,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },

  tabs: {
    display: "flex",
    gap: 6,
    padding: 4,
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fff",
  },
  tab: {
    padding: "8px 12px",
    borderRadius: 10,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontWeight: 700,
    color: "#374151",
  },
  tabActive: {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "#f3f4f6",
    cursor: "pointer",
    fontWeight: 800,
    color: "#111827",
  },

  card: {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    background: "#fff",
  },
  subCard: {
    borderTop: "1px dashed #e5e7eb",
    paddingTop: 12,
    marginTop: 12,
  },
  input: {
    width: "100%",
    padding: 10,
    borderRadius: 10,
    border: "1px solid #d1d5db",
    marginBottom: 10,
    outline: "none",
  },
  titleInput: {
    width: 560,
    maxWidth: "78vw",
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    outline: "none",
    fontWeight: 700,
    marginLeft: 6,
  },
  titleInputSmall: {
    width: 520,
    maxWidth: "72vw",
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    outline: "none",
    fontWeight: 700,
    marginLeft: 6,
  },
  inlineInput: {
    width: 140,
    padding: "6px 10px",
    borderRadius: 10,
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
    borderRadius: 10,
    cursor: "pointer",
  },
  secondary: {
    padding: "8px 12px",
    background: "#f3f4f6",
    color: "#111827",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 600,
  },
  ghost: {
    padding: "8px 10px",
    background: "#fff",
    color: "#111827",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 700,
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
    borderRadius: 10,
    marginBottom: 10,
    fontSize: 13,
  },
  oHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  krRow: {
    border: "1px solid #eef2f7",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    background: "#fafafa",
  },
  krHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },
  krMeta: {
    marginTop: 10,
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
    padding: "10px 0",
    borderBottom: "1px solid #eef2f7",
  },

  // ··· 按钮 & 菜单
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 900,
    lineHeight: "1",
  },
  menu: {
    position: "absolute",
    right: 0,
    top: 42,
    minWidth: 160,
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
    padding: 6,
    zIndex: 20,
  },
  menuItem: {
    width: "100%",
    textAlign: "left",
    padding: "10px 10px",
    border: "none",
    background: "transparent",
    borderRadius: 10,
    cursor: "pointer",
    fontSize: 14,
  },
  menuItemDanger: {
    width: "100%",
    textAlign: "left",
    padding: "10px 10px",
    border: "none",
    background: "transparent",
    borderRadius: 10,
    cursor: "pointer",
    fontSize: 14,
    color: "#b91c1c",
  },

  // Modal
  modalMask: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.35)",
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
    background: "#fff",
    borderRadius: 14,
    border: "1px solid #e5e7eb",
    boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 14px 10px 14px",
    borderBottom: "1px solid #eef2f7",
  },
  modalBody: {
    padding: 14,
  },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "#fff",
    cursor: "pointer",
    fontSize: 16,
    lineHeight: "1",
  },

  // Tree
  treeOuter: {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fff",
    padding: 14,
  },
  treeHint: {
    color: "#6b7280",
    fontSize: 12,
    marginBottom: 10,
  },
  treeWrap: {
    position: "relative",
    overflowX: "auto",
    padding: 20,
    borderRadius: 12,
    background: "#fafafa",
    border: "1px solid #eef2f7",
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
  krCol: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    minWidth: 260,
  },
  nodeCard: {
    width: 260,
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "#fff",
    padding: 14,
    boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
  },
  nodeRoot: {
    width: 320,
  },
  nodeTitle: {
    fontWeight: 900,
    fontSize: 16,
    marginBottom: 6,
  },
  nodeSub: {
    color: "#374151",
    fontSize: 13,
    marginBottom: 10,
    lineHeight: 1.35,
    maxHeight: 40,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  nodeMeta: {
    color: "#6b7280",
    fontSize: 12,
    borderTop: "1px solid #eef2f7",
    paddingTop: 10,
  },
};
