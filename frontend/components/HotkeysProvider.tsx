"use client";

import { useState, useCallback } from "react";
import { useHotkeys } from "@/hooks/useHotkeys";
import { HotkeysHelp } from "@/components/HotkeysHelp";

export function HotkeysProvider({ children }: { children: React.ReactNode }) {
  const [helpOpen, setHelpOpen] = useState(false);

  const onShowHelp = useCallback((open: boolean = true) => {
    setHelpOpen(open);
  }, []);

  useHotkeys(onShowHelp);

  return (
    <>
      {children}
      <HotkeysHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
