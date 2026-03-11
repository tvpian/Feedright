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
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-b">
      <ul className="flex justify-around items-center h-16 px-2">
        {NAV.map(({ label, icon: Icon, href }) => {
          const active =
            href === "/"
              ? path === "/"
              : path.startsWith(href.split("/").slice(0, 2).join("/"));
          return (
            <li key={label} className="flex-1">
              <Link
                href={href}
                className={clsx(
                  "flex flex-col items-center justify-center gap-0.5 h-full tap-target",
                  active ? "text-brand-600" : "text-gray-500"
                )}
              >
                <Icon size={22} />
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
