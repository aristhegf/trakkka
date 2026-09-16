"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <Button type="button" size="sm" variant="secondary" onClick={copy} aria-label={label}>
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded bg-surface px-2 py-1.5 font-mono text-xs">{value}</code>
        <CopyButton value={value} label={`Copy ${label}`} />
      </div>
    </div>
  );
}

export function TokenReveal({ token, providerKey, assetId }: { token: string; providerKey: string; assetId: string }) {
  // Prefer the public URL: a phone cannot reach localhost, so instructions must show the deployed address.
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || (typeof window !== "undefined" ? window.location.origin : "");
  const url = `${base}/api/ingest/${providerKey}`;
  const isLocal = /localhost|127\.0\.0\.1/.test(base);

  return (
    <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
      <p className="font-medium">Device token (shown once)</p>
      <p className="text-xs text-muted">Only a hash is kept on the server. If you lose it, rotate it from the asset&apos;s Settings tab.</p>

      {providerKey === "traccar_client" ? (
        <>
          <ol className="list-decimal space-y-1 pl-4 text-xs">
            <li>Install <strong>Traccar Client</strong> from the App Store or Google Play (free).</li>
            <li>Open its settings and paste the two values below.</li>
            <li>Set location accuracy to <strong>High</strong>, distance to <strong>50</strong> m, and turn on <strong>Offline buffering</strong>.</li>
            <li>Optional: set <strong>Stationary heartbeat</strong> to 900 s so the map stays fresh while you are still.</li>
            <li>Turn tracking on and allow location <strong>Always</strong> when asked.</li>
          </ol>
          <CopyRow label="Server URL" value={url} />
          <CopyRow label="Device identifier" value={token} />
        </>
      ) : providerKey === "owntracks" ? (
        <>
          <ol className="list-decimal space-y-1 pl-4 text-xs">
            <li>Install <strong>OwnTracks</strong> from the App Store or Google Play (free).</li>
            <li>In its connection settings choose mode <strong>HTTP</strong> and paste the URL below.</li>
            <li>Turn on <strong>Authentication</strong>. Username can be anything (e.g. trakkka); the password is the token below.</li>
            <li>Use <strong>Significant</strong> monitoring for all-day battery life, or <strong>Move</strong> for live tracking.</li>
            <li>Allow location <strong>Always</strong> when asked.</li>
          </ol>
          <CopyRow label="URL" value={url} />
          <CopyRow label="Password" value={token} />
        </>
      ) : (
        <>
          <CopyRow label="Token" value={token} />
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
        </>
      )}

      {isLocal && (providerKey === "traccar_client" || providerKey === "owntracks") ? (
        <p className="text-xs text-danger">This URL points at your laptop, which your phone cannot reach. Create the asset on https://trakkka.vercel.app instead.</p>
      ) : null}
    </div>
  );
}
