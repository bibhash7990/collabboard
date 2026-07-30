import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shapes } from 'lucide-react';
import { LIMITS } from '@collabboard/shared';
import { authApi } from '../api/auth';
import { useAuthStore } from '../stores/authStore';
import { useToast } from '../hooks/useToast';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import type { NormalizedError } from '../lib/apiClient';

// Mirror of the server's registerSchema (see shared/schemas) for instant feedback.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
}

/** Account creation screen with inline validation that mirrors the server schema. */
export function RegisterPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const toast = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!name.trim()) next.name = 'Please enter your name.';
    if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email address.';
    if (password.length < LIMITS.PASSWORD_MIN)
      next.password = `Password must be at least ${LIMITS.PASSWORD_MIN} characters.`;
    return next;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      const { user, accessToken } = await authApi.register({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      setAuth(user, accessToken);
      // Verification is fire-and-forget; in dev the link is printed to the server console.
      toast('Verification email sent — check the server console in dev.', 'info');
      navigate('/app', { replace: true });
    } catch (err) {
      // apiClient's interceptor already rejects with a NormalizedError.
      toast((err as NormalizedError).message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-slate-50 via-white to-brand-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30">
            <Shapes className="h-5 w-5" />
          </span>
          <span className="text-xl font-bold tracking-tight text-slate-900">CollabBoard</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Create your account
          </h1>
          <p className="mt-1 text-sm text-slate-500">Spin up a workspace in seconds.</p>

          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
            <Input
              name="name"
              label="Name"
              autoComplete="name"
              placeholder="Ada Lovelace"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((s) => ({ ...s, name: undefined }));
              }}
              error={errors.name}
            />
            <Input
              name="email"
              type="email"
              label="Email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((s) => ({ ...s, email: undefined }));
              }}
              error={errors.email}
            />
            <Input
              name="password"
              type="password"
              label="Password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((s) => ({ ...s, password: undefined }));
              }}
              error={errors.password}
            />
            <Button type="submit" size="lg" loading={submitting} className="mt-1 w-full">
              Create account
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
