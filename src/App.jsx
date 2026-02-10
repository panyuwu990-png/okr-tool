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
  const [okrs, setOkrs] = useState([]);
  const [title, setTitle] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      loadOkrs();
    }
  }, [session]);

  async function loadOkrs() {
    const { data } = await supabase
      .from("okr_items")
      .select("*")
      .order("created_at", { ascending: false });
    setOkrs(data || []);
  }

  async function signIn() {
    setLoading(true);
    await supabase.auth.signInWithOtp({ email });
    alert("登录链接已发送到邮箱");
    setLoading(false);
  }

  async function addOkr() {
    if (!title) return;
    await supabase.from("okr_items").insert({
      id: crypto.randomUUID(),
      title,
      type: "O",
      level: "company",
      department: "company",
      owner_id: session.user.id,
      owner_email: session.user.email,
      owner_name: session.user.email
    });
    setTitle("");
    loadOkrs();
  }

  async function signOut() {
    await supabase.auth.signOut();
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
        <h2>OKR 列表</h2>
        <button style={styles.link} onClick={signOut}>
          退出
        </button>
      </div>

      <div style={styles.card}>
        <input
          style={styles.input}
          placeholder="新增一个 Objective"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button style={styles.button} onClick={addOkr}>
          新增 O
        </button>
      </div>

      {okrs.map((o) => (
        <div key={o.id} style={styles.card}>
          <strong>{o.title}</strong>
          <div style={styles.meta}>负责人：{o.owner_email}</div>
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
    maxWidth: 720,
    margin: "40px auto",
    padding: 16
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24
  },
  card: {
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12
  },
  input: {
    width: "100%",
    padding: 8,
    marginBottom: 8
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
    color: "#6b7280",
    marginTop: 4
  }
};
