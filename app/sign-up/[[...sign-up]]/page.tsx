import { redirect } from 'next/navigation';

/**
 * Public self-serve sign-up is disabled.
 * Users are created in the Clerk Dashboard (or by admins via /users).
 */
export default function SignUpPage() {
  redirect('/sign-in');
}
