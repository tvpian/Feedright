"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/lib/userContext";

/**
 * Public paths that don't require an active profile.
 * "/" is the profile picker / entry screen.
 * "/profile/new" lets users create their first profile.
 */
const PUBLIC_PATHS = ["/", "/profile/new"];

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useUser();
  const pathname = usePathname();
  const router = useRouter();

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  useEffect(() => {
    if (loading) return;
    if (!profile && !isPublic) {
      router.replace("/");
    }
  }, [profile, loading, isPublic, router]);

  // Public pages always render — they handle their own loading state
  if (isPublic) return <>{children}</>;

  // Protected pages: block render until we know auth state
  if (loading) return null;

  // No profile → redirect is in flight, render nothing to avoid flash
  if (!profile) return null;

  return <>{children}</>;
}
