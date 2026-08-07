import { useState } from "react";
import { X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { SERIF, SANS, MONO } from "../../data/constants";
import { FL } from "../common/FL";

export function AuthModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode]       = useState<"signin"|"signup">("signin");
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);

  const submit = async () => {
    setLoading(true); setError("");
    try {
      if (mode === "signin") {
        const { error: e } = await supabase.auth.signInWithPassword({ email, password });
        if (e) throw e;
        onClose();
      } else {
        const { error: e } = await supabase.auth.signUp({ email, password });
        if (e) throw e;
        setDone(true);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-background border border-border rounded-sm w-full max-w-sm p-6 shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-medium" style={{ fontFamily: SERIF }}>
            {mode === "signin" ? "Sign in" : "Create account"}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={16} /></button>
        </div>

        {done ? (
          <p className="text-xs text-muted-foreground" style={{ fontFamily: SANS }}>
            Check your email to confirm your account, then sign in.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-4 mb-5">
              <div>
                <FL>Email</FL>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full bg-transparent border-b border-border pb-0.5 text-xs text-foreground focus:outline-none focus:border-accent transition-colors placeholder:text-muted-foreground/40"
                  style={{ fontFamily: SANS }} placeholder="you@example.com" />
              </div>
              <div>
                <FL>Password</FL>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && submit()}
                  className="w-full bg-transparent border-b border-border pb-0.5 text-xs text-foreground focus:outline-none focus:border-accent transition-colors placeholder:text-muted-foreground/40"
                  style={{ fontFamily: SANS }} placeholder="••••••••" />
              </div>
              {error && <p className="text-xs text-red-500" style={{ fontFamily: MONO }}>{error}</p>}
            </div>
            <button onClick={submit} disabled={loading}
              className="w-full py-2 bg-foreground text-background text-xs rounded-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ fontFamily: SANS }}>
              {loading ? "…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>

            {/* OAuth divider */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] text-muted-foreground/60 uppercase tracking-[0.14em]" style={{ fontFamily: MONO }}>or</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } })}
                className="w-full py-2 border border-border rounded-sm text-xs text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-2"
                style={{ fontFamily: SANS }}>
                Continue with Google
              </button>
              <button
                onClick={() => supabase.auth.signInWithOAuth({ provider: "apple", options: { redirectTo: window.location.origin } })}
                className="w-full py-2 border border-border rounded-sm text-xs text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-2"
                style={{ fontFamily: SANS }}>
                Continue with Apple
              </button>
            </div>

            <p className="text-xs text-center text-muted-foreground mt-4" style={{ fontFamily: SANS }}>
              {mode === "signin" ? "No account? " : "Already have one? "}
              <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="underline hover:text-foreground transition-colors">
                {mode === "signin" ? "Sign up" : "Sign in"}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
