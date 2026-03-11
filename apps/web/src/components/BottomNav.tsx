"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PlusCircle, BarChart3, Lightbulb, User } from "lucide-react";
import { clsx } from "clsx";
import { format } from "date-fns";
import { useUser } from "@/lib/userContext";

const today = () => format(new Date(), "yyyy-MM-dd");

const NAV = [
  { label: "Today",    icon: Home,       href: "/" },
  { label: "Log",      icon: PlusCircle, href: `/log/${today()}` },
  { label: "Insights", icon: BarChart3,  href: "/insights" },
  { label: "Next Food",icon: Lightbulb,  href: `/recommendations/${today()}` },
  { label: "Profile",  icon: User,       href: "/profile" },
];

export function BottomNav() {
  const { profile } = useUser();
  const path = usePathname();

  if (!profile) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-3 px-4 safe-b pointer-events-none">
      <nav
        className="pointer-events-auto w-full max-w-sm rounded-3xl px-2 py-1.5"
        style={{
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.12), 0 1px 0 rgba(255,255,255,0.8) inset, 0 0 0 1px rgba(0,0,0,0.06)",
        }}
      >
        <ul className="flex justify-around items-center">
          {NAV.map(({ label, icon: Icon, href }) => {
            const active =
              href === "/"
                ? path === "/"
                : path.startsWith(href.split("/").slice(0, 2).join("/"));
            return (
              <li key={label} className="flex-1">
                <Link
                  href={href}
                  className="flex flex-col items-center justify-center gap-0.5 py-2 tap-target"
                >
                  <div
                    className={clsx(
                      "flex items-center justify-center w-10 h-8 rounded-xl transition-all duration-200",
                      active
                        ? "bg-brand-600 text-white shadow-sm"
                        : "text-gray-400"
                    )}
                  >
                    <Icon size={active ? 19 : 21} strokeWidth={active ? 2.5 : 1.8} />
                  </div>
                  <span
                    className={clsx(
                      "text-[10px] font-semibold leading-none transition-colors duration-200",
                      active ? "text-brand-600" : "text-gray-400"
                    )}
                  >
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

