"use client";

import { Suspense } from "react";
import MessagesPage from "./MessagesClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground">...</div>}>
      <MessagesPage />
    </Suspense>
  );
}
