"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageUp } from "lucide-react";
import { uploadAssetPhoto } from "@/lib/assets/actions";
import { Button } from "@/components/motion/button/base";
import { useActionToast } from "@/components/kit/toast";

export function PhotoUpload({ assetId }: { assetId: string }) {
  const [pending, start] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const report = useActionToast();

  return (
    <form
      ref={formRef}
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await uploadAssetPhoto(assetId, fd);
          if (report(r, "Photo updated")) {
            formRef.current?.reset();
            setFileName(null);
          }
          router.refresh();
        });
      }}
    >
      <p className="text-sm text-muted-foreground">A photo makes the asset easier to recognise. JPEG, PNG or WebP.</p>
      <input ref={inputRef} type="file" name="photo" accept="image/jpeg,image/png,image/webp" className="sr-only" required onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()}>
          <ImageUp className="h-4 w-4" /> {fileName ? "Change photo" : "Choose photo"}
        </Button>
        {fileName ? (
          <Button type="submit" disabled={pending}>
            {pending ? "Uploading…" : "Upload"}
          </Button>
        ) : null}
      </div>
      {fileName ? <p className="truncate text-xs text-muted-foreground">{fileName}</p> : null}
    </form>
  );
}
