import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default function App() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const [objectives, setObjectives] = useState([]);
  const [newOTitle, setNewOTitle] = useState("");

  const [newKR, setNewKR] = useState({
    title: "",
    target: "",
    current: ""
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadData();
  }, [session]);

  async function loadData() {
    const { data } = await supabase
      .from("okr_items")
      .select("*")
      .order("created_at", { ascending: true });

    const os = data.filter((i) => i.type === "O");
    const krs = data.filter((i) => i.type === "KR");

    const merged = os.map((o) => ({
      ...o,
      krs: krs.filter((k) => k.parent_id === o.id)
    }));

    setObjectives(merged);
  }

  async function signIn() {
    setLoading(true);
    await supabase.auth.signInWithOtp({ email });
    alert("登录链接已发送到邮箱");
    setLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function addObjective() {
    if (!newOTitle) return;
    await supabase.from("okr_items").insert({
      id: crypto.randomUUID(),
      title: newOTitle,
      type: "O",
      level: "company",
      department: "company",
      owner_id: session.user.id,
      owner_email: session.user.email,
      owner_name: session.user.email
    });
    setNewOTitle("");
    loadData();
  }

  async function addKR(parentId) {
    if (!newKR.title || !newKR.target) return;

    await supabase.from("okr_items").insert({
      id: crypto.randomUUID(),
      title: newKR.title,
      type: "KR",
      parent_id: parentId,
      target_value: Number(newKR.target),
      current_value: Number(newKR.current || 0),
      owner_id: session.user.id,
      owner_email: session.user.email,
      owner_name: session.user.email
    });

    setNewKR({ title: "", target: "", current: "" });
    loadData();
  }

  if (!session) {
    return (
      <div style={styles.center}>
        <h2>OKR 系统登录</h2>
        <input
          style={styles.input}
          placeholder="输入邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button style={styles.button} onClick={signIn} disabled={loading}>
          {loading ? "发送中..." : "发送登录链接"}
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2>OKR（O → KR）</h2>
        <button style={styles.link} onClick={signOut}>
          退出
        </button>
      </div>

      <div style={styles.card}>
        <input
          style={styles.input}
          placeholder="新增 Objective"
          value={newOTitle}
          onChange={(e) => setNewOTitle(e.target.value)}
        />
        <button style={styles.button} onClick={addObjective}>
          新增 O
        </button>
      </div>

      {objectives.map((o) => (
        <div key={o.id} style={styles.card}>
          <strong>{o.title}</strong>

          {o.krs.map((k) => {
            const progress = k.target_value
              ? Math.round((k.current_value / k.target_value) * 100)
              : 0;

            return (
              <div key={k.id} style={styles.kr}>
                <div>
                  {k.title}
                  <span style={styles.meta}>
                    {" "}
                    · 进度 {progress}%
                  </span>
                </div>
              </div>
            );
          })}

          <div style={styles.krForm}>
            <input
              style={styles.input}
              placeholder="KR 描述"
              value={newKR.title}
              onChange={(e) =>
                setNewKR({ ...newKR, title: e.target.value })
              }
            />
            <input
              style={styles.input}
              placeholder="目标值"
              type="number"
              value={newKR.target}
              onChange={(e) =>
                setNewKR({ ...newKR, target: e.target.value })
              }
            />
            <input
              style={styles.input}
              placeholder="当前值"
              type="number"
              value={newKR.current}
              onChange={(e) =>
                setNewKR({ ...newKR, current: e.target.value })
              }
            />
            <button style={styles.button} onClick={() => addKR(o.id)}>
              新增 KR
            </button>
          </div>
        </div>
      ))}
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
    justifyContent: "center"
  },
  container: {
    maxWidth: 800,
    margin: "40px auto",
    padding: 16
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 24
  },
  card: {
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16
  },
  kr: {
    paddingLeft: 12,
    fontSize: 14,
    marginTop: 6
  },
  krForm: {
    marginTop: 12
  },
  input: {
    width: "100%",
    padding: 8,
    marginBottom: 6
  },
  button: {
    padding: "8px 12px",
    background: "#111827",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer"
  },
  link: {
    background: "none",
    border: "none",
    color: "#2563eb",
    cursor: "pointer"
  },
  meta: {
    fontSize: 12,
    color: "#6b7280"
  }
};
