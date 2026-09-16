import { Loader } from "@/components/motion/loader";

export default function Loading() {
  return (
    <div className="grid h-full place-items-center">
      <Loader variant="dots" className="text-muted-foreground" />
    </div>
  );
}
