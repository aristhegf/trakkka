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
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-muted">Welcome back. Your assets are waiting.</p>
      {error === "oauth" ? <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">Google sign-in did not complete. Try again.</p> : null}
      {error === "link" ? <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">That link is invalid or has expired.</p> : null}
      {deleted ? <p className="mt-3 rounded-md bg-success/10 px-3 py-2 text-sm text-success">Your account and all its data were deleted.</p> : null}
      <LoginForm next={next} />
      <p className="mt-6 text-center text-sm text-muted">
        No account?{" "}
        <Link href="/signup" className="font-medium text-accent hover:underline">
          Create one
        </Link>
      </p>
    </>
  );
}
