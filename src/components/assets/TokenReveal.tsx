"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TokenReveal({ token, providerKey, assetId }: { token: string; providerKey: string; assetId: string }) {
  const [copied, setCopied] = useState(false);
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${base}/api/ingest/${providerKey}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
      <p className="font-medium">Device token (shown once)</p>
      <p className="text-xs text-muted">Store it with the tracker or the simulator. Only a hash is kept server-side; lost tokens must be rotated.</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded bg-surface px-2 py-1.5 font-mono text-xs">{token}</code>
        <Button type="button" size="sm" variant="secondary" onClick={copy} aria-label="Copy token">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <p className="text-xs text-muted">Endpoint:</p>
      <code className="block overflow-x-auto rounded bg-surface px-2 py-1.5 font-mono text-xs">POST {url}</code>
      {providerKey === "simulated" ? (
        <pre className="overflow-x-auto rounded bg-surface px-2 py-1.5 font-mono text-[11px] text-muted">{`npm run simulate -- --asset ${assetId} --token ${token.slice(0, 8)}…`}</pre>
      ) : null}
      {providerKey === "traccar" ? (
        <pre className="overflow-x-auto rounded bg-surface px-2 py-1.5 font-mono text-[11px] text-muted">{`# traccar.xml
<entry key='forward.enable'>true</entry>
<entry key='forward.type'>json</entry>
<entry key='forward.url'>${url}</entry>
<entry key='forward.header'>Authorization: Bearer ${token}</entry>
<entry key='forward.retry.enable'>true</entry>`}</pre>
      ) : null}
    </div>
  );
}
