import Link from "next/link";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Create your account</h1>
      <p className="mt-1 text-sm text-muted">Beta access is free. You can delete your account and data at any time.</p>
      <SignupForm />
      <p className="mt-6 text-center text-sm text-muted">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
