"use client";

import {
  Building2,
  Boxes,
  ClipboardList,
  Droplets,
  FlaskConical,
  Globe2,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MenuIcon,
  Package,
  PackageCheck,
  ScrollText,
  Sparkles,
  Store,
  Tag,
  Truck,
  Users,
  Warehouse,
  FolderTree,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menus";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/app/[locale]/(auth)/actions";
import type { NavIcon, NavSection } from "./nav-types";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  products: Package,
  brands: Tag,
  categories: FolderTree,
  notes: Sparkles,
  families: Droplets,
  concentrations: FlaskConical,
  stock: Boxes,
  batches: PackageCheck,
  countries: Globe2,
  legalEntities: Building2,
  stores: Store,
  warehouses: Warehouse,
  suppliers: Truck,
  users: Users,
  roles: KeyRound,
  audit: ScrollText,
};

type ShellUser = { name: string; email: string };

function SidebarNav({ nav, onNavigate }: { nav: NavSection[]; onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("overview")} className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
      {nav.map((section) => (
        <div key={section.section} className="grid gap-1">
          <p className="px-3 pb-1 text-[0.7rem] font-semibold tracking-wider text-sidebar-muted uppercase">
            {t(section.section)}
          </p>
          {section.items.map((item) => {
            const Icon = ICONS[item.icon];
            const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent",
                  active ? "bg-sidebar-accent font-medium text-white" : "text-sidebar-foreground/85",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {t(item.label)}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  const meta = useTranslations("metadata");
  return (
    <div className="flex h-16 items-center gap-2 border-b border-white/10 px-6">
      <span className="font-display text-xl tracking-wide text-white">{meta("storeName")}</span>
      <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[0.65rem] font-medium tracking-wide text-[#e4cfa6] uppercase">
        {meta("adminTitle")}
      </span>
    </div>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const t = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 rounded-full p-1 pe-3 text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        data-testid="user-menu"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {initials}
        </span>
        <span className="hidden max-w-40 truncate sm:inline">{user.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <span className="block font-medium">{user.name}</span>
          <span className="ltr-value block truncate text-xs text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account/password">
            <KeyRound /> {t("changePassword")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/">
            <ClipboardList /> {t("goToStore")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pending}
          data-testid="sign-out"
          onSelect={(event) => {
            event.preventDefault();
            startTransition(async () => {
              await signOutAction();
              router.replace("/login");
              router.refresh();
            });
          }}
        >
          <LogOut /> {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AdminShell({ nav, user, children }: { nav: NavSection[]; user: ShellUser; children: ReactNode }) {
  const t = useTranslations("common");
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-dvh bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded focus:bg-card focus:px-3 focus:py-2"
      >
        {t("skipToContent")}
      </a>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex print:hidden">
        <Brand />
        <SidebarNav nav={nav} />
      </aside>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent closeLabel={t("close")} aria-describedby={undefined}>
          <DialogTitle className="sr-only">{t("openMenu")}</DialogTitle>
          <Brand />
          <SidebarNav nav={nav} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card/90 px-4 backdrop-blur sm:px-6 print:hidden">
          <button
            type="button"
            className="rounded-md p-2 hover:bg-accent lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label={t("openMenu")}
          >
            <MenuIcon className="size-5" />
          </button>
          <div className="flex-1" />
          <LocaleSwitcher />
          <UserMenu user={user} />
        </header>
        <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8 print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}
