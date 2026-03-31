"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function BookRedirectClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    router.replace(query ? `/dashboard/book?${query}` : "/dashboard/book");
  }, [router, searchParams]);

  return null;
}
