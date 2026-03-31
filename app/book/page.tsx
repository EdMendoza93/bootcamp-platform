import { Suspense } from "react";
import BookRedirectClient from "./redirect-client";

export default function BookPage() {
  return (
    <Suspense fallback={null}>
      <BookRedirectClient />
    </Suspense>
  );
}
