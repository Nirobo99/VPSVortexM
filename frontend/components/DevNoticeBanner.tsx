"use client";

import { useEffect, useRef } from "react";

/**
 * Временное объявление о разработке.
 * Чтобы убрать: установите SHOW_DEV_NOTICE = false и пересоберите frontend.
 */
export const SHOW_DEV_NOTICE = true;

const NOTICE_TEXT =
  "ВНИМАНИЕ. В данное время проект находится в разработке и возможны сбои, частые обновления, вылетания, зависания. Просьба не паниковать. Мы занимаемся улучшением проекта для вашего удобства. Приносим извинения за неудобства. Команда VortexM.";

export function DevNoticeBanner() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!SHOW_DEV_NOTICE) return;
    const el = ref.current;
    if (!el) return;

    const applyOffset = () => {
      document.documentElement.style.setProperty("--dev-notice-offset", `${el.offsetHeight}px`);
    };
    applyOffset();
    const ro = new ResizeObserver(applyOffset);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--dev-notice-offset");
    };
  }, []);

  if (!SHOW_DEV_NOTICE) return null;

  return (
    <div
      ref={ref}
      role="status"
      className="fixed top-0 inset-x-0 z-[60] border-b border-amber-500/25 bg-amber-950/80 text-amber-50 backdrop-blur-md"
    >
      <p className="mx-auto max-w-5xl px-3 py-1.5 sm:py-2 text-center text-[10px] sm:text-xs leading-snug opacity-95">
        {NOTICE_TEXT}
      </p>
    </div>
  );
}
