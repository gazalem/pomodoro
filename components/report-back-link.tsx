"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeftIcon } from "./icons";

export function BackLink({ view }: { view: "focus" | "exercise" }) {
  return (
    <Link
      href={view === "exercise" ? "/exercise" : "/"}
      aria-label={view === "exercise" ? "Back to exercise" : "Back to timer"}
      className="grid size-10 place-items-center rounded-full hover:bg-ink/5 dark:hover:bg-mist/10"
    >
      <ArrowLeftIcon className="text-xl" />
    </Link>
  );
}

export function BackLinkFromParams() {
  return <BackLink view={useSearchParams().get("view") === "exercise" ? "exercise" : "focus"} />;
}
