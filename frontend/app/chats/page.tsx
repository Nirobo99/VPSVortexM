"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ChatsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/messages?tab=chats");
  }, [router]);
  return null;
}
