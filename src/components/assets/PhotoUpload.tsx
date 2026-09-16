"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadAssetPhoto } from "@/lib/assets/actions";
import { Button } from "@/components/ui/button";

export function PhotoUpload({ assetId }: { assetId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await uploadAssetPhoto(assetId, fd);
          setMsg(r.error ?? r.message ?? null);
          router.refresh();
        });
      }}
    >
      <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" className="text-xs" required />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? "Uploading…" : "Upload"}
      </Button>
      {msg ? <span className="text-xs text-muted">{msg}</span> : null}
    </form>
  );
}
