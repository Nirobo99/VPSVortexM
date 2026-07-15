"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ChannelsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/messages?tab=channels");
  }, [router]);
  return null;
}
