import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/dashboard";
  const error = typeof sp.error === "string" ? sp.error : null;
  const deleted = sp.deleted === "1";
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-muted-foreground">Sign in to see where your things are.</p>
      {error === "oauth" ? <Notice tone="error">Google sign-in did not complete. Please try again.</Notice> : null}
      {error === "link" ? <Notice tone="error">That link is invalid or has expired.</Notice> : null}
      {deleted ? <Notice tone="success">Your account and all its data were deleted.</Notice> : null}
      <LoginForm next={next} />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to Trakkka?{" "}
        <Link href="/signup" className="inline-flex min-h-11 items-center font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}

function Notice({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  return <p className={tone === "error" ? "mt-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive" : "mt-4 rounded-2xl bg-fresh-live/10 px-4 py-3 text-sm text-fresh-live"}>{children}</p>;
}
