import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard/Dashboard";

export const metadata = { title: "Map" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="h-full w-full bg-background" />}>
      <Dashboard />
    </Suspense>
  );
}
