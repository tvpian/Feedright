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
import { PinModal } from "../components/PinModal";

interface UserCtx {
  profile: UserProfile | null;
  profiles: UserProfile[];
  setProfile: (p: UserProfile) => void;
  refreshProfiles: () => Promise<void>;
  loading: boolean;
  lockProfile: (id: string) => void;
  switchProfile: () => void;
}

const Ctx = createContext<UserCtx>({
  profile: null,
  profiles: [],
  setProfile: () => {},
  refreshProfiles: async () => {},
  loading: true,
  lockProfile: () => {},
  switchProfile: () => {},
});

const STORAGE_KEY = "nutritrack_active_user_id";
const UNLOCKED_KEY = "nutritrack_unlocked_profiles";

// Active profile persists in localStorage so that tabs / browser restarts
// keep the user logged in. PIN-unlock state stays in sessionStorage (security).
const getSavedProfile = () => localStorage.getItem(STORAGE_KEY);
const setSavedProfile = (id: string) => localStorage.setItem(STORAGE_KEY, id);
const clearSavedProfile = () => localStorage.removeItem(STORAGE_KEY);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // PIN state
  const [pendingProfile, setPendingProfile] = useState<UserProfile | null>(null);
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(() => {
    try {
      const raw = sessionStorage.getItem(UNLOCKED_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const addUnlocked = (id: string) => {
    setUnlockedIds((prev) => {
      const next = new Set(prev).add(id);
      sessionStorage.setItem(UNLOCKED_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const refreshProfiles = useCallback(async () => {
    try {
      const list = await api.profiles.list();
      setProfiles(list);

      // Restore the last-used profile so tabs / browser restarts stay logged in.
      const savedId = getSavedProfile();
      const active = savedId ? (list.find((p) => p.id === savedId) ?? null) : null;
      setProfileState(active);
      if (!active) clearSavedProfile();
    } catch {
      /* API not yet available – silently ignore during SSR / cold start */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProfiles();
  }, [refreshProfiles]);

  const setProfile = useCallback(
    (p: UserProfile) => {
      if (p.has_pin && !unlockedIds.has(p.id)) {
        setPendingProfile(p);
        return;
      }
      setProfileState(p);
      setSavedProfile(p.id);
    },
    [unlockedIds],
  );

  const lockProfile = useCallback((id: string) => {
    setUnlockedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      sessionStorage.setItem(UNLOCKED_KEY, JSON.stringify([...next]));
      return next;
    });
    clearSavedProfile();
    // Switch away if this was the active profile
    setProfileState((cur) => (cur?.id === id ? null : cur));
  }, []);

  // Log out / switch profile — clears saved profile without needing a PIN
  const switchProfile = useCallback(() => {
    clearSavedProfile();
    setProfileState(null);
  }, []);

  return (
    <Ctx.Provider value={{ profile, profiles, setProfile, refreshProfiles, loading, lockProfile, switchProfile }}>
      {children}
      {pendingProfile && (
        <PinModal
          profileName={pendingProfile.name}
          onVerify={async (pin) => {
            const res = await api.profiles.verifyPin(pendingProfile.id, pin);
            if (res.ok) {
              addUnlocked(pendingProfile.id);
              setProfileState(pendingProfile);
              setSavedProfile(pendingProfile.id);
              setPendingProfile(null);
              return true;
            }
            return false;
          }}
          onClose={() => setPendingProfile(null)}
        />
      )}
    </Ctx.Provider>
  );
}

export const useUser = () => useContext(Ctx);
