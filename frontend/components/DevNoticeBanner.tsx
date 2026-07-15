"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Временное объявление о разработке.
 * Чтобы убрать полностью: установите SHOW_DEV_NOTICE = false и пересоберите frontend.
 * Пользователь может скрыть баннер на текущую сессию страницы; после перезагрузки он снова появится.
 */
export const SHOW_DEV_NOTICE = true;

const NOTICE_TEXT =
  "ВНИМАНИЕ. В данное время проект находится в разработке и возможны сбои, частые обновления, вылетания, зависания. Просьба не паниковать. Мы занимаемся улучшением проекта для вашего удобства. Приносим извинения за неудобства. Команда VortexM.";

export function DevNoticeBanner() {
  const ref = useRef<HTMLDivElement>(null);
  const [dismissed, setDismissed] = useState(false);
  const visible = SHOW_DEV_NOTICE && !dismissed;

  useEffect(() => {
    if (!visible) {
      document.documentElement.style.removeProperty("--dev-notice-offset");
      return;
    }

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
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      ref={ref}
      role="status"
      className="fixed top-0 inset-x-0 z-[60] border-b border-amber-500/25 bg-amber-950/80 text-amber-50 backdrop-blur-md"
    >
      <div className="mx-auto max-w-5xl px-3 py-1.5 sm:py-2 flex items-start gap-2">
        <p className="flex-1 text-center text-[10px] sm:text-xs leading-snug opacity-95">{NOTICE_TEXT}</p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded p-1 text-amber-100/80 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Скрыть объявление"
          title="Скрыть"
        >
          <span className="block text-sm leading-none" aria-hidden>
            ×
          </span>
        </button>
      </div>
    </div>
  );
}
