import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import { api, clearToken, getToken, setToken } from "@/src/lib/api";

export type User = {
  user_id: string;
  email: string;
  name: string;
  picture?: string | null;
  gelar?: "Ustadz" | "Ustadzah" | null;
  reminder_hour: number;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
  setGelar: (gelar: "Ustadz" | "Ustadzah", name?: string) => Promise<User | null>;
  setReminderHour: (hour: number) => Promise<User | null>;
};

const AuthContext = createContext<AuthState | null>(null);

function getRedirectUrl(): string {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      return window.location.origin + "/auth/callback";
    }
    return "/auth/callback";
  }
  return Linking.createURL("auth/callback");
}

async function exchangeSession(sessionId: string): Promise<string> {
  // Send session_id to OUR backend; backend calls Emergent server-side (avoids CORS).
  const resp = await api<{ user: User; token: string }>("/auth/session", {
    method: "POST",
    body: { session_id: sessionId },
  });
  await setToken(resp.token);
  return resp.token;
}

function extractSessionId(url: string): string | null {
  if (!url) return null;
  // hash first
  const hashIdx = url.indexOf("#");
  if (hashIdx >= 0) {
    const hash = url.slice(hashIdx + 1);
    const m = new URLSearchParams(hash).get("session_id");
    if (m) return m;
  }
  const qIdx = url.indexOf("?");
  if (qIdx >= 0) {
    const q = url.slice(qIdx + 1).split("#")[0];
    const m = new URLSearchParams(q).get("session_id");
    if (m) return m;
  }
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const processedRef = useRef(false);

  const refreshUser = useCallback(async (): Promise<User | null> => {
    const token = await getToken();
    if (!token) {
      setUser(null);
      return null;
    }
    try {
      const me = await api<User>("/auth/me");
      setUser(me);
      return me;
    } catch {
      await clearToken();
      setUser(null);
      return null;
    }
  }, []);

  // Boot: handle session_id in URL (web), then load existing token
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const url = window.location.href;
          const sid = extractSessionId(url);
          if (sid && !processedRef.current) {
            processedRef.current = true;
            try {
              await exchangeSession(sid);
              // clean url
              window.history.replaceState(null, "", window.location.pathname);
            } catch (e) {
              console.warn("session exchange failed", e);
            }
          }
        } else {
          // Mobile cold-start fallback
          const initial = await Linking.getInitialURL();
          if (initial) {
            const sid = extractSessionId(initial);
            if (sid && !processedRef.current) {
              processedRef.current = true;
              try {
                await exchangeSession(sid);
              } catch (e) {
                console.warn("session exchange failed", e);
              }
            }
          }
        }
        await refreshUser();
      } finally {
        setLoading(false);
      }
    })();

    if (Platform.OS !== "web") {
      const sub = Linking.addEventListener("url", async ({ url }) => {
        const sid = extractSessionId(url);
        if (sid && !processedRef.current) {
          processedRef.current = true;
          try {
            await exchangeSession(sid);
            await refreshUser();
          } catch (e) {
            console.warn("session exchange failed", e);
          }
        }
      });
      return () => sub.remove();
    }
  }, [refreshUser]);

  const signIn = useCallback(async () => {
    const redirectUrl = getRedirectUrl();
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") {
        window.location.href = authUrl;
      }
      return;
    }
    processedRef.current = false;
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    if (result.type === "success" && result.url) {
      const sid = extractSessionId(result.url);
      if (sid && !processedRef.current) {
        processedRef.current = true;
        await exchangeSession(sid);
        await refreshUser();
      }
    }
  }, [refreshUser]);

  const signOut = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    await clearToken();
    setUser(null);
    processedRef.current = false;
  }, []);

  const setGelar = useCallback(
    async (gelar: "Ustadz" | "Ustadzah", name?: string) => {
      const updated = await api<User>("/auth/gelar", {
        method: "POST",
        body: { gelar, name },
      });
      setUser(updated);
      return updated;
    },
    [],
  );

  const setReminderHour = useCallback(async (hour: number) => {
    const updated = await api<User>("/auth/reminder", {
      method: "POST",
      body: { reminder_hour: hour },
    });
    setUser(updated);
    return updated;
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, signIn, signOut, refreshUser, setGelar, setReminderHour }),
    [user, loading, signIn, signOut, refreshUser, setGelar, setReminderHour],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
