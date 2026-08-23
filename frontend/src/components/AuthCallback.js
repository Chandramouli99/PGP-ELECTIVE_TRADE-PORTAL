import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = window.location.hash || "";
    const sessionId = new URLSearchParams(hash.replace("#", "")).get("session_id");

    (async () => {
      try {
        const { data } = await api.post("/auth/session", { session_id: sessionId });
        if (data.session_token) localStorage.setItem("session_token", data.session_token);
        setUser(data);
        window.history.replaceState(null, "", window.location.pathname);
        navigate(data.role === "admin" ? "/admin" : "/dashboard", { replace: true });
      } catch (e) {
        window.history.replaceState(null, "", "/");
        navigate("/", { replace: true, state: { error: e?.response?.data?.detail || "Login failed" } });
      }
    })();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary text-white">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm tracking-wide">Signing you in…</p>
      </div>
    </div>
  );
}
