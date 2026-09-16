"use client";

import { useActionState, useState } from "react";
import { Car, CheckCircle2, Package, PawPrint, Smartphone } from "lucide-react";
import { createAsset, updateAsset, type ActionResult } from "@/lib/assets/actions";
import { PROVIDER_HELP, providerOptionsFor } from "@/lib/tracking/registry";
import type { AssetOverview, AssetType, DeviceProfile, PetProfile, ProviderKey, TrackingProviderRow, VehicleProfile } from "@/lib/types";
import { Button } from "@/components/motion/button/base";
import { Input } from "@/components/motion/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { ChoiceCards, FieldLabel, FormSelect, Textarea } from "@/components/kit/form";
import { NavButton } from "@/components/kit/nav-button";
import { Section } from "@/components/kit/page";
import { TYPE_LABEL } from "./AssetIcon";
import { TokenReveal } from "./TokenReveal";
import { useAssetStore } from "@/components/store/AssetStore";

const TYPES: { type: AssetType; icon: React.ReactNode }[] = [
  { type: "device", icon: <Smartphone /> },
  { type: "pet", icon: <PawPrint /> },
  { type: "vehicle", icon: <Car /> },
  { type: "other", icon: <Package /> },
];

const str = (v: string | number | null | undefined) => (v == null ? "" : String(v));

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
  const [type, setType] = useState<AssetType>(asset?.type ?? "device");
  // null until the user picks one: the default is then the first (recommended) option for the chosen asset type.
  const [provider, setProvider] = useState<ProviderKey | null>((asset?.tracking_provider_key as ProviderKey) ?? null);
  const action = mode === "create" ? createAsset : updateAsset.bind(null, asset!.id);
  const [state, formAction, pending] = useActionState<ActionResult | undefined, FormData>(action, undefined);

  const providerOptions = providerOptionsFor(type).filter((k) => providers[k]);
  const currentProvider = provider && providerOptions.includes(provider) ? provider : providerOptions[0];
  const providerRow: TrackingProviderRow | undefined = providers[currentProvider];
  const needsToken = ["simulated", "traccar", "ios_companion", "traccar_client", "owntracks"].includes(currentProvider);
  const isPhoneApp = currentProvider === "traccar_client" || currentProvider === "owntracks";

  if (state?.id && mode === "create") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-3xl bg-fresh-live/10 px-4 py-3 text-fresh-live">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{state.token ? "Added. One last step: connect the tracker below." : "Added."}</p>
        </div>
        {state.token ? <TokenReveal token={state.token} providerKey={currentProvider} assetId={state.id} /> : null}
        <div className="flex flex-wrap gap-2">
          <NavButton href={`/assets/${state.id}`}>Open asset</NavButton>
          <NavButton href="/dashboard" variant="secondary">
            Back to map
          </NavButton>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="type" value={type} />

      {mode === "create" ? (
        <Section title="What are you tracking?">
          <Tabs value={type} onValueChange={(v) => setType(v as AssetType)} variant="segment">
            <TabsList className="grid w-full grid-cols-4 bg-muted p-1">
              {TYPES.map((t) => (
                <TabsTrigger key={t.type} value={t.type} className="flex h-14 w-full flex-col gap-1 px-1 text-xs [&_svg]:h-5 [&_svg]:w-5">
                  {t.icon}
                  {TYPE_LABEL[t.type]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </Section>
      ) : null}

      <Section title="Basics">
        <div className="space-y-4">
          <Input label="Name" name="name" required maxLength={80} defaultValue={asset?.name ?? ""} placeholder={type === "pet" ? "Milo" : type === "vehicle" ? "Family car" : type === "device" ? "My phone" : "Backpack"} />
          <Textarea label="Description" hint="Optional." name="description" maxLength={1000} defaultValue={asset?.description ?? ""} />
          <div className="flex flex-col gap-1.5">
            <FieldLabel hint="Optional. A hex colour like #f59e0b.">Colour</FieldLabel>
            <Input name="color" type="text" pattern="^#[0-9a-fA-F]{6}$" placeholder="#f59e0b" defaultValue={asset?.color ?? ""} />
          </div>
        </div>
      </Section>

      {mode === "create" ? (
        <Section title="How will it report its location?" description="Pick the option that matches what you have. You can add another asset later for a different method.">
          <ChoiceCards
            name="tracking_provider_key"
            value={currentProvider}
            onValueChange={(v) => setProvider(v as ProviderKey)}
            options={providerOptions.map((k, i) => ({
              value: k,
              label: providers[k]?.name ?? k,
              description: PROVIDER_HELP[k],
              badge: i === 0 ? "Recommended" : undefined,
            }))}
          />
          {providerRow ? (
            <p className="mt-3 px-1 text-xs leading-relaxed text-muted-foreground">
              With this method a location counts as live for {providerRow.live_after_s < 120 ? `${providerRow.live_after_s} seconds` : `${Math.round(providerRow.live_after_s / 60)} minutes`} and recent for {Math.round(providerRow.recent_after_s / 60)} minutes.
              {providerRow.offline_after_s > 0 ? ` You get an alert if nothing arrives for ${Math.round(providerRow.offline_after_s / 60)} minutes.` : ""}
            </p>
          ) : null}
          {needsToken && !isPhoneApp ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <FieldLabel hint="IMEI or Traccar uniqueId. Optional for the simulator.">Tracker ID</FieldLabel>
                <Input name="external_device_id" maxLength={120} />
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel hint="Optional, e.g. Teltonika FMC920.">Tracker model</FieldLabel>
                <Input name="tracker_model" maxLength={80} />
              </div>
            </div>
          ) : null}
        </Section>
      ) : null}

      {type === "pet" ? <PetFields pet={pet} /> : null}
      {type === "vehicle" ? <VehicleFields vehicle={vehicle} /> : null}
      {type === "device" ? <DeviceFields device={device} /> : null}

      {state?.error ? <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{state.error}</p> : null}
      {state?.message && mode === "edit" ? <p className="rounded-2xl bg-fresh-live/10 px-4 py-3 text-sm text-fresh-live">{state.message}</p> : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <NavButton href={mode === "create" ? "/dashboard" : `/assets/${asset!.id}`} variant="ghost" size="lg">
          Cancel
        </NavButton>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Add asset" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

function PetFields({ pet }: { pet?: PetProfile | null }) {
  return (
    <Section title="About your pet" description="All optional. Helpful if someone finds them.">
      <Grid>
        <Input label="Species" name="species" defaultValue={str(pet?.species)} placeholder="Dog" />
        <Input label="Breed" name="breed" defaultValue={str(pet?.breed)} placeholder="Labrador" />
        <FormSelect
          name="sex"
          label="Sex"
          defaultValue={str(pet?.sex)}
          placeholder="Not set"
          options={[
            { value: "male", label: "Male" },
            { value: "female", label: "Female" },
            { value: "unknown", label: "Unknown" },
          ]}
        />
        <Input label="Date of birth" name="date_of_birth" type="date" defaultValue={str(pet?.date_of_birth)} />
        <Input label="Microchip ID" name="microchip_id" defaultValue={str(pet?.microchip_id)} />
        <Input label="Weight (kg)" name="weight_kg" type="number" step="0.1" min="0" inputMode="decimal" defaultValue={str(pet?.weight_kg)} />
        <Input label="Emergency contact" name="emergency_contact_name" defaultValue={str(pet?.emergency_contact_name)} placeholder="Name" />
        <Input label="Emergency phone" name="emergency_contact_phone" type="tel" defaultValue={str(pet?.emergency_contact_phone)} />
        <div className="sm:col-span-2">
          <Textarea label="Medical notes" name="medical_notes" defaultValue={str(pet?.medical_notes)} />
        </div>
        <div className="sm:col-span-2">
          <Textarea label="Notes" name="notes" defaultValue={str(pet?.notes)} />
        </div>
      </Grid>
    </Section>
  );
}

function VehicleFields({ vehicle }: { vehicle?: VehicleProfile | null }) {
  return (
    <Section title="About the vehicle" description="All optional.">
      <Grid>
        <Input label="Make" name="make" defaultValue={str(vehicle?.make)} placeholder="Toyota" />
        <Input label="Model" name="model" defaultValue={str(vehicle?.model)} placeholder="Corolla" />
        <Input label="Year" name="year" type="number" min={1950} max={2100} inputMode="numeric" defaultValue={str(vehicle?.year)} />
        <Input label="Plate number" name="registration_number" defaultValue={str(vehicle?.registration_number)} placeholder="LND 123 AB" />
        <Input label="VIN (17 characters)" name="vin" minLength={17} maxLength={17} defaultValue={str(vehicle?.vin)} />
        <Input label="Body colour" name="color" defaultValue={str(vehicle?.color)} />
        <FormSelect
          name="fuel_type"
          label="Fuel"
          defaultValue={str(vehicle?.fuel_type)}
          placeholder="Not set"
          options={[
            { value: "petrol", label: "Petrol" },
            { value: "diesel", label: "Diesel" },
            { value: "electric", label: "Electric" },
            { value: "hybrid", label: "Hybrid" },
            { value: "unknown", label: "Unknown" },
          ]}
        />
        <div className="flex flex-col gap-1.5">
          <FieldLabel hint="Get an alert above this speed.">Speed alert (km/h)</FieldLabel>
          <Input name="speed_limit_kph" type="number" min={5} max={300} inputMode="numeric" defaultValue={str(vehicle?.speed_limit_kph)} />
        </div>
      </Grid>
    </Section>
  );
}

function DeviceFields({ device }: { device?: DeviceProfile | null }) {
  return (
    <Section title="About the device" description="All optional.">
      <Grid>
        <FormSelect
          name="device_type"
          label="Kind of device"
          defaultValue={str(device?.device_type)}
          placeholder="Not set"
          options={[
            { value: "phone", label: "Phone" },
            { value: "tablet", label: "Tablet" },
            { value: "laptop", label: "Laptop" },
            { value: "watch", label: "Watch" },
            { value: "tracker", label: "GPS tracker" },
            { value: "other", label: "Other" },
          ]}
        />
        <Input label="Manufacturer" name="manufacturer" defaultValue={str(device?.manufacturer)} placeholder="Samsung" />
        <Input label="Model" name="model" defaultValue={str(device?.model)} placeholder="Galaxy S24" />
        <Input label="Serial number" name="serial_number" defaultValue={str(device?.serial_number)} />
        <Input label="Operating system" name="os" defaultValue={str(device?.os)} placeholder="Android" />
        <Input label="OS version" name="os_version" defaultValue={str(device?.os_version)} />
      </Grid>
    </Section>
  );
}
