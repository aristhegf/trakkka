"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/motion/button/base";
import { BouncyAccordion } from "@/components/motion/bouncy-accordion";
import { useToast } from "@/components/kit/toast";

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy", "Select the text and copy it by hand.");
    }
  };
  return (
    <div className="rounded-2xl bg-muted/70 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 select-all break-all font-mono text-sm">{value}</code>
        <Button type="button" size="sm" variant="secondary" onClick={copy} aria-label={`Copy ${label}`} className="h-11 shrink-0 px-3.5">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm leading-relaxed">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
          <span className="pt-0.5">{item}</span>
        </li>
      ))}
    </ol>
  );
}

export function TokenReveal({ token, providerKey, assetId }: { token: string; providerKey: string; assetId: string }) {
  // Prefer the public URL: a phone cannot reach localhost, so instructions must show the deployed address.
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || (typeof window !== "undefined" ? window.location.origin : "");
  const url = `${base}/api/ingest/${providerKey}`;
  const isLocal = /localhost|127\.0\.0\.1/.test(base);
  const isPhoneApp = providerKey === "traccar_client" || providerKey === "owntracks";

  return (
    <div className="space-y-4 rounded-3xl border border-border bg-card p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          <KeyRound className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-semibold">{isPhoneApp ? "Connect your phone" : "Connect the tracker"}</h2>
          <p className="text-sm text-muted-foreground">These values are shown only once. If you lose them, make new ones from the asset&apos;s Settings.</p>
        </div>
      </div>

      {isLocal && isPhoneApp ? (
        <p className="flex gap-2 rounded-2xl bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          This address points at your computer, which your phone cannot reach. Add the asset on https://trakkka.vercel.app instead.
        </p>
      ) : null}

      {providerKey === "traccar_client" ? (
        <>
          <Steps
            items={[
              <>Install <strong>Traccar Client</strong> from the App Store or Google Play. It is free.</>,
              <>Open the app&apos;s settings and paste the two values below.</>,
              <>Set accuracy to <strong>High</strong>, distance to <strong>50</strong> m, and turn on <strong>Offline buffering</strong>.</>,
              <>Turn tracking on and allow location <strong>Always</strong>.</>,
            ]}
          />
          <CopyRow label="Server URL" value={url} />
          <CopyRow label="Device identifier" value={token} />
          <p className="text-xs text-muted-foreground">Tip: set Stationary heartbeat to 900 s so the map stays fresh while you are not moving.</p>
        </>
      ) : providerKey === "owntracks" ? (
        <>
          <Steps
            items={[
              <>Install <strong>OwnTracks</strong> from the App Store or Google Play. It is free.</>,
              <>In connection settings choose mode <strong>HTTP</strong> and paste the URL below.</>,
              <>Turn on <strong>Authentication</strong>. Any username works; the password is below.</>,
              <>Choose <strong>Significant</strong> monitoring to save battery, or <strong>Move</strong> for live tracking. Allow location <strong>Always</strong>.</>,
            ]}
          />
          <CopyRow label="URL" value={url} />
          <CopyRow label="Password" value={token} />
        </>
      ) : (
        <>
          <CopyRow label="Device token" value={token} />
          <BouncyAccordion
            collapsible
            items={[
              {
                id: "setup",
                title: <span className="text-sm">Setup for developers</span>,
                description: (
                  <div className="space-y-2 text-xs">
                    <p className="text-muted-foreground">Send locations with:</p>
                    <code className="block break-all rounded-xl bg-muted px-3 py-2 font-mono">POST {url}</code>
                    {providerKey === "simulated" ? <pre className="overflow-x-auto rounded-xl bg-muted px-3 py-2 font-mono">{`npm run simulate -- --asset ${assetId} --token ${token.slice(0, 8)}…`}</pre> : null}
                    {providerKey === "traccar" ? (
                      <pre className="overflow-x-auto rounded-xl bg-muted px-3 py-2 font-mono">{`# traccar.xml
<entry key='forward.enable'>true</entry>
<entry key='forward.type'>json</entry>
<entry key='forward.url'>${url}</entry>
<entry key='forward.header'>Authorization: Bearer ${token}</entry>
<entry key='forward.retry.enable'>true</entry>`}</pre>
                    ) : null}
                  </div>
                ),
              },
            ]}
          />
        </>
      )}
    </div>
  );
}
