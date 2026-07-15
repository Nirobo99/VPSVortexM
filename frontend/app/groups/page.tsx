"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GroupsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/messages?tab=groups");
  }, [router]);
  return null;
}
