"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { CallScreen } from "@/components/calls/CallScreen";
import { useAuth } from "@/hooks/useAuth";

export default function CallPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  const callId = params.callId as string;

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  if (loading || !user) {
    return <div className="min-h-screen flex items-center justify-center">...</div>;
  }

  return <CallScreen callId={callId} />;
}
