"use client";

/**
 * CircleNav — floating FAB with an upper semicircle of app destinations.
 * Mount only inside authenticated AppShell (do not gate on a second useAuth).
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Home,
  LogOut,
  MessageCircle,
  Settings,
  Shield,
  ShoppingBag,
  User,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export interface CircleNavProps {
  activePath: string;
  isAdmin: boolean;
  /** Unread badge on Messages */
  messageUnread?: number;
  onLogout: () => void;
}

type NavItem = {
  id: string;
  href?: string;
  action?: "logout";
  labelKey: string;
  Icon: LucideIcon;
  angle: number;
};

function isPathActive(pathname: string, href?: string) {
  if (!href) return false;
  if (href === "/messages") {
    return (
      pathname === "/messages" ||
      pathname.startsWith("/chats") ||
      pathname.startsWith("/channels") ||
      pathname.startsWith("/groups")
    );
  }
  if (href === "/marketplace") {
    return pathname === "/marketplace" || pathname.startsWith("/marketplace/");
  }
  if (href === "/admin") {
    return pathname.startsWith("/admin");
  }
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** 0° = top, clockwise → cartesian (y grows downward in CSS). */
function polar(angleDeg: number, radius: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius };
}

/** Evenly space n items on the upper semicircle (left → top → right). */
function semicircleAngles(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  // 270° (left) clockwise through 0° (top) to 90° (right) = 180° sweep
  const start = 270;
  const sweep = 180;
  return Array.from({ length: count }, (_, i) => (start + (sweep * i) / (count - 1)) % 360);
}

function VortexMark({ className, gradId }: { className?: string; gradId: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E9D5FF" />
          <stop offset="100%" stopColor="#FFFFFF" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradId})`}
        d="M8 6c1.2 0 2.2.6 2.8 1.6L16 18.2 21.2 7.6C21.8 6.6 22.8 6 24 6h1.2l-7.4 15.2c-.5 1-1.5 1.6-2.6 1.6h-.4c-1.1 0-2.1-.6-2.6-1.6L4.8 6H8z"
      />
      <path
        fill="none"
        stroke="#F472B6"
        strokeWidth="1.6"
        strokeLinecap="round"
        d="M10 24c3.5-4 8.5-4 12 0"
        opacity="0.9"
      />
    </svg>
  );
}

export function CircleNav({ activePath, isAdmin, messageUnread = 0, onLogout }: CircleNavProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const gradId = useId().replace(/:/g, "");

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const items: NavItem[] = useMemo(() => {
    const base: Omit<NavItem, "angle">[] = [
      { id: "dashboard", href: "/dashboard", labelKey: "navigation.dashboard", Icon: Home },
      { id: "messages", href: "/messages", labelKey: "navigation.messages", Icon: MessageCircle },
      { id: "marketplace", href: "/marketplace", labelKey: "navigation.marketplace", Icon: ShoppingBag },
      { id: "profile", href: "/profile", labelKey: "navigation.profile", Icon: User },
      { id: "wallet", href: "/wallet", labelKey: "navigation.wallet", Icon: Wallet },
      { id: "settings", href: "/settings", labelKey: "navigation.settings", Icon: Settings },
    ];
    if (isAdmin) {
      base.push({ id: "admin", href: "/admin", labelKey: "navigation.admin", Icon: Shield });
    }
    base.push({ id: "logout", action: "logout", labelKey: "navigation.logout", Icon: LogOut });

    const angles = semicircleAngles(base.length);
    return base.map((item, i) => ({ ...item, angle: angles[i]! }));
  }, [isAdmin]);

  // Wider arc when many items so petals do not overlap
  const radius = isMobile ? (items.length > 6 ? 108 : 92) : items.length > 6 ? 128 : 112;
  const centerSize = isMobile ? 52 : 56;
  const childSize = isMobile ? 44 : 48;
  const labelSize = isMobile ? 10 : 12;

  const close = useCallback(() => setIsOpen(false), []);

  const toggle = useCallback((e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setIsOpen((v) => !v);
  }, []);

  const activate = useCallback(
    (item: NavItem) => {
      close();
      if (item.action === "logout") {
        onLogout();
        return;
      }
      if (item.href) router.push(item.href);
    },
    [close, onLogout, router]
  );

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [isOpen, close]);

  useEffect(() => {
    if (!isOpen) return;
    const t = window.setTimeout(() => itemRefs.current[0]?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [isOpen, items.length]);

  useEffect(() => {
    close();
  }, [activePath, close]);

  const onPetalKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = (index + 1) % items.length;
      setFocusIndex(next);
      itemRefs.current[next]?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (index - 1 + items.length) % items.length;
      setFocusIndex(next);
      itemRefs.current[next]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      setFocusIndex(0);
      itemRefs.current[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      const last = items.length - 1;
      setFocusIndex(last);
      itemRefs.current[last]?.focus();
    }
  };

  const spring = reduceMotion
    ? { type: "tween" as const, duration: 0.01 }
    : { type: "spring" as const, stiffness: 300, damping: 20 };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[50]">
      <AnimatePresence>
        {isOpen && (
          <motion.button
            type="button"
            key="circle-nav-overlay"
            aria-label={t("navigation.close_menu")}
            className="pointer-events-auto fixed inset-0 z-[45] bg-black/60 backdrop-blur-[8px] dark:bg-black/75"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              close();
            }}
          />
        )}
      </AnimatePresence>

      <div
        className="pointer-events-none fixed bottom-6 left-1/2 z-[50] -translate-x-1/2"
        style={{ width: centerSize, height: centerSize }}
        role="presentation"
      >
        <AnimatePresence>
          {isOpen &&
            items.map((item, index) => {
              const { x, y } = polar(item.angle, radius);
              const labelOffset = polar(item.angle, radius + (isMobile ? 30 : 36));
              const active = isPathActive(activePath, item.href);
              const Icon = item.Icon;
              const showBadge = item.id === "messages" && messageUnread > 0;

              return (
                <motion.div
                  key={item.id}
                  className="pointer-events-none absolute left-1/2 top-1/2 z-[51]"
                  style={{ marginLeft: -childSize / 2, marginTop: -childSize / 2 }}
                  initial={reduceMotion ? false : { x: 0, y: 0, scale: 0, opacity: 0 }}
                  animate={{ x, y, scale: 1, opacity: 1 }}
                  exit={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                  transition={{
                    ...spring,
                    delay: reduceMotion ? 0 : index * 0.04,
                    opacity: { duration: 0.18, delay: reduceMotion ? 0 : index * 0.04 },
                  }}
                >
                  <button
                    ref={(el) => {
                      itemRefs.current[index] = el;
                    }}
                    type="button"
                    role="menuitem"
                    tabIndex={focusIndex === index ? 0 : -1}
                    aria-current={active ? "page" : undefined}
                    aria-label={t(item.labelKey)}
                    className={cn(
                      "pointer-events-auto relative flex items-center justify-center rounded-full",
                      "bg-[#1E3A8A]/90 text-white transition-shadow duration-200",
                      "hover:bg-[#2563EB] hover:shadow-[0_0_16px_rgba(192,132,252,0.6)]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F472B6]",
                      "active:bg-[#2563EB]",
                      active && "ring-2 ring-[#F472B6] shadow-[0_0_16px_rgba(192,132,252,0.55)]",
                      item.action === "logout" && "bg-rose-900/90 hover:bg-rose-700"
                    )}
                    style={{ width: childSize, height: childSize }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      activate(item);
                    }}
                    onKeyDown={(e) => onPetalKeyDown(e, index)}
                  >
                    <Icon
                      className={cn(
                        "h-5 w-5",
                        active ? "text-[#F472B6]" : "text-white",
                        item.action === "logout" && "text-[#F472B6]"
                      )}
                      strokeWidth={2.25}
                    />
                    {showBadge && (
                      <span className="absolute -right-1 -top-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-[#F472B6] text-[10px] font-bold text-white flex items-center justify-center tabular-nums">
                        {messageUnread > 99 ? "99+" : messageUnread}
                      </span>
                    )}
                  </button>

                  <motion.span
                    className="pointer-events-none absolute z-[1] whitespace-nowrap font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]"
                    style={{
                      fontSize: labelSize,
                      left: "50%",
                      top: "50%",
                      transform: `translate(-50%, -50%) translate(${labelOffset.x - x}px, ${labelOffset.y - y}px)`,
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: reduceMotion ? 0 : 0.08 + index * 0.04, duration: 0.2 }}
                  >
                    {t(item.labelKey)}
                  </motion.span>
                </motion.div>
              );
            })}
        </AnimatePresence>

        <motion.button
          type="button"
          tabIndex={0}
          id={menuId}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-controls={isOpen ? `${menuId}-menu` : undefined}
          aria-label={isOpen ? t("navigation.close_menu") : t("navigation.open_menu")}
          className={cn(
            "pointer-events-auto absolute left-0 top-0 z-[52] flex items-center justify-center rounded-full",
            "bg-gradient-to-br from-[#7C3AED] to-[#1D4ED8] text-white",
            "shadow-[0_4px_20px_rgba(124,58,237,0.4)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#F472B6]"
          )}
          style={{ width: centerSize, height: centerSize }}
          animate={isOpen ? { scale: 1.1 } : { scale: 1 }}
          transition={spring}
          onClick={toggle}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggle(e);
            }
          }}
        >
          <span
            className={cn(
              "flex items-center justify-center",
              !isOpen && !reduceMotion && "circle-nav-pulse"
            )}
          >
            <AnimatePresence mode="wait" initial={false}>
              {isOpen ? (
                <motion.span
                  key="close"
                  initial={{ opacity: 0, rotate: -45, scale: 0.6 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ duration: reduceMotion ? 0 : 0.15 }}
                  className="flex"
                >
                  <X className="h-7 w-7 text-[#F472B6]" strokeWidth={2.5} />
                </motion.span>
              ) : (
                <motion.span
                  key="logo"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ duration: reduceMotion ? 0 : 0.15 }}
                  className="flex"
                >
                  <VortexMark className="h-8 w-8" gradId={`vx-${gradId}`} />
                </motion.span>
              )}
            </AnimatePresence>
          </span>
        </motion.button>

        {isOpen && (
          <div id={`${menuId}-menu`} role="menu" className="sr-only">
            {items.map((item) => (
              <span key={item.id}>{t(item.labelKey)}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
