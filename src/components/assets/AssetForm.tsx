"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createAsset, updateAsset, type ActionResult } from "@/lib/assets/actions";
import { PROVIDER_HELP, providerOptionsFor } from "@/lib/tracking/registry";
import type { AssetOverview, AssetType, DeviceProfile, PetProfile, ProviderKey, TrackingProviderRow, VehicleProfile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { TYPE_LABEL } from "./AssetIcon";
import { TokenReveal } from "./TokenReveal";
import { useAssetStore } from "@/components/store/AssetStore";

const TYPES: AssetType[] = ["pet", "vehicle", "device", "other"];

export function AssetForm({
  mode,
  asset,
  pet,
  vehicle,
  device,
}: {
  mode: "create" | "edit";
  asset?: AssetOverview;
  pet?: PetProfile | null;
  vehicle?: VehicleProfile | null;
  device?: DeviceProfile | null;
}) {
  const { providers } = useAssetStore();
  const [type, setType] = useState<AssetType>(asset?.type ?? "pet");
  const [provider, setProvider] = useState<ProviderKey>((asset?.tracking_provider_key as ProviderKey) ?? "simulated");
  const action = mode === "create" ? createAsset : updateAsset.bind(null, asset!.id);
  const [state, formAction, pending] = useActionState<ActionResult | undefined, FormData>(action, undefined);

  const providerOptions = providerOptionsFor(type).filter((k) => providers[k]);
  const currentProvider = providerOptions.includes(provider) ? provider : providerOptions[0];
  const providerRow: TrackingProviderRow | undefined = providers[currentProvider];
  const needsToken = currentProvider === "simulated" || currentProvider === "traccar" || currentProvider === "ios_companion";

  if (state?.id && mode === "create") {
    return (
      <div className="space-y-4">
        <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">Asset created.</p>
        {state.token ? <TokenReveal token={state.token} providerKey={currentProvider} assetId={state.id} /> : null}
        <div className="flex gap-2">
          <Link href={`/assets/${state.id}`} className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground">
            Open asset
          </Link>
          <Link href="/dashboard" className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium">
            Back to map
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="type" value={type} />
      {mode === "create" ? (
        <fieldset>
          <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Asset type</legend>
          <div className="grid grid-cols-4 gap-2">
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`rounded-lg border px-2 py-2 text-sm font-medium ${type === t ? "border-accent bg-accent/10 text-accent" : "border-border bg-surface hover:bg-surface-2"}`}
                aria-pressed={type === t}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <Field label="Name">
        <Input name="name" required maxLength={80} defaultValue={asset?.name ?? ""} placeholder={type === "pet" ? "Milo" : type === "vehicle" ? "Toyota Corolla" : "iPhone"} />
      </Field>
      <Field label="Description" hint="Optional.">
        <Textarea name="description" maxLength={1000} defaultValue={asset?.description ?? ""} />
      </Field>
      <Field label="Marker colour" hint="Optional. Leave blank for the default per type.">
        <Input name="color" type="text" pattern="^#[0-9a-fA-F]{6}$" placeholder="#f59e0b" defaultValue={asset?.color ?? ""} />
      </Field>

      {mode === "create" ? (
        <fieldset className="space-y-3 rounded-lg border border-border p-3">
          <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted">Tracking method</legend>
          <Select name="tracking_provider_key" value={currentProvider} onChange={(e) => setProvider(e.target.value as ProviderKey)}>
            {providerOptions.map((k) => (
              <option key={k} value={k}>
                {providers[k]?.name ?? k}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted">{PROVIDER_HELP[currentProvider]}</p>
          {providerRow ? (
            <p className="text-[11px] text-muted">
              Freshness for this source: live under {providerRow.live_after_s}s, recent under {Math.round(providerRow.recent_after_s / 60)} min, stale after.
              {providerRow.offline_after_s > 0 ? ` No-report alert after ${Math.round(providerRow.offline_after_s / 60)} min.` : ""}
            </p>
          ) : null}
          {needsToken ? (
            <>
              <Field label="Tracker / device ID" hint="For Traccar use the device's IMEI or uniqueId. Optional for the simulator.">
                <Input name="external_device_id" maxLength={120} />
              </Field>
              <Field label="Tracker model" hint="Optional, e.g. Teltonika FMC920.">
                <Input name="tracker_model" maxLength={80} />
              </Field>
            </>
          ) : null}
        </fieldset>
      ) : null}

      {type === "pet" ? <PetFields pet={pet} /> : null}
      {type === "vehicle" ? <VehicleFields vehicle={vehicle} /> : null}
      {type === "device" ? <DeviceFields device={device} /> : null}

      {state?.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state?.message && mode === "edit" ? <p className="text-sm text-success">{state.message}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Create asset" : "Save changes"}
        </Button>
        <Link href={mode === "create" ? "/dashboard" : `/assets/${asset!.id}`} className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-surface-2">
          Cancel
        </Link>
      </div>
    </form>
  );
}

function PetFields({ pet }: { pet?: PetProfile | null }) {
  return (
    <fieldset className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
      <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted">Pet</legend>
      <Field label="Species">
        <Input name="species" defaultValue={pet?.species ?? ""} placeholder="Cat" />
      </Field>
      <Field label="Breed">
        <Input name="breed" defaultValue={pet?.breed ?? ""} placeholder="Maine Coon" />
      </Field>
      <Field label="Sex">
        <Select name="sex" defaultValue={pet?.sex ?? ""}>
          <option value="">—</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="unknown">Unknown</option>
        </Select>
      </Field>
      <Field label="Date of birth">
        <Input name="date_of_birth" type="date" defaultValue={pet?.date_of_birth ?? ""} />
      </Field>
      <Field label="Microchip ID">
        <Input name="microchip_id" defaultValue={pet?.microchip_id ?? ""} />
      </Field>
      <Field label="Weight (kg)">
        <Input name="weight_kg" type="number" step="0.1" min="0" defaultValue={pet?.weight_kg ?? ""} />
      </Field>
      <Field label="Emergency contact name">
        <Input name="emergency_contact_name" defaultValue={pet?.emergency_contact_name ?? ""} />
      </Field>
      <Field label="Emergency contact phone">
        <Input name="emergency_contact_phone" defaultValue={pet?.emergency_contact_phone ?? ""} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Medical notes">
          <Textarea name="medical_notes" defaultValue={pet?.medical_notes ?? ""} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Notes">
          <Textarea name="notes" defaultValue={pet?.notes ?? ""} />
        </Field>
      </div>
    </fieldset>
  );
}

function VehicleFields({ vehicle }: { vehicle?: VehicleProfile | null }) {
  return (
    <fieldset className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
      <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted">Vehicle</legend>
      <Field label="Make">
        <Input name="make" defaultValue={vehicle?.make ?? ""} placeholder="Toyota" />
      </Field>
      <Field label="Model">
        <Input name="model" defaultValue={vehicle?.model ?? ""} placeholder="Corolla" />
      </Field>
      <Field label="Year">
        <Input name="year" type="number" min={1950} max={2100} defaultValue={vehicle?.year ?? ""} />
      </Field>
      <Field label="Registration number">
        <Input name="registration_number" defaultValue={vehicle?.registration_number ?? ""} placeholder="LND 123 AB" />
      </Field>
      <Field label="VIN" hint="17 characters.">
        <Input name="vin" minLength={17} maxLength={17} defaultValue={vehicle?.vin ?? ""} />
      </Field>
      <Field label="Colour">
        <Input name="color" defaultValue={vehicle?.color ?? ""} />
      </Field>
      <Field label="Fuel">
        <Select name="fuel_type" defaultValue={vehicle?.fuel_type ?? ""}>
          <option value="">—</option>
          <option value="petrol">Petrol</option>
          <option value="diesel">Diesel</option>
          <option value="electric">Electric</option>
          <option value="hybrid">Hybrid</option>
          <option value="unknown">Unknown</option>
        </Select>
      </Field>
      <Field label="Speed alert (km/h)" hint="Alert when the vehicle exceeds this speed.">
        <Input name="speed_limit_kph" type="number" min={5} max={300} defaultValue={vehicle?.speed_limit_kph ?? ""} />
      </Field>
    </fieldset>
  );
}

function DeviceFields({ device }: { device?: DeviceProfile | null }) {
  return (
    <fieldset className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
      <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted">Device</legend>
      <Field label="Device type">
        <Select name="device_type" defaultValue={device?.device_type ?? ""}>
          <option value="">—</option>
          <option value="phone">Phone</option>
          <option value="tablet">Tablet</option>
          <option value="laptop">Laptop</option>
          <option value="watch">Watch</option>
          <option value="tracker">Tracker</option>
          <option value="other">Other</option>
        </Select>
      </Field>
      <Field label="Manufacturer">
        <Input name="manufacturer" defaultValue={device?.manufacturer ?? ""} placeholder="Apple" />
      </Field>
      <Field label="Model">
        <Input name="model" defaultValue={device?.model ?? ""} placeholder="iPhone 16" />
      </Field>
      <Field label="Serial number" hint="Optional.">
        <Input name="serial_number" defaultValue={device?.serial_number ?? ""} />
      </Field>
      <Field label="OS">
        <Input name="os" defaultValue={device?.os ?? ""} placeholder="iOS" />
      </Field>
      <Field label="OS version">
        <Input name="os_version" defaultValue={device?.os_version ?? ""} />
      </Field>
    </fieldset>
  );
}
