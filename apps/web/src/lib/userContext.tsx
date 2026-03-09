"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { UserProfile } from "./types";
import { api } from "./api";

interface UserCtx {
  profile: UserProfile | null;
  profiles: UserProfile[];
  setProfile: (p: UserProfile) => void;
  refreshProfiles: () => Promise<void>;
  loading: boolean;
}

const Ctx = createContext<UserCtx>({
  profile: null,
  profiles: [],
  setProfile: () => {},
  refreshProfiles: async () => {},
  loading: true,
});

const STORAGE_KEY = "nutritrack_active_user_id";

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfiles = useCallback(async () => {
    try {
      const list = await api.profiles.list();
      setProfiles(list);

      const savedId = localStorage.getItem(STORAGE_KEY);
      const active = list.find((p) => p.id === savedId) ?? list[0] ?? null;
      if (active) setProfileState(active);
    } catch {
      /* API not yet available – silently ignore during SSR / cold start */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProfiles();
  }, [refreshProfiles]);

  const setProfile = useCallback((p: UserProfile) => {
    setProfileState(p);
    localStorage.setItem(STORAGE_KEY, p.id);
  }, []);

  return (
    <Ctx.Provider value={{ profile, profiles, setProfile, refreshProfiles, loading }}>
      {children}
    </Ctx.Provider>
  );
}

export const useUser = () => useContext(Ctx);
