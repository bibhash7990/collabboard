import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Shapes, Users, XCircle } from 'lucide-react';
import type { Invitation } from '@collabboard/shared';
import { invitationsApi } from '../api/boardExtras';
import { useAuthStore } from '../stores/authStore';
import { useToast } from '../hooks/useToast';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import type { NormalizedError } from '../lib/apiClient';

type Status = 'loading' | 'ready' | 'error';

/**
 * Landing target for `${CLIENT_URL}/accept-invite/<token>`. Requires a session:
 * the server matches the invitation email to the caller, so we ask the visitor
 * to sign in first (preserving the token) before previewing + accepting.
 */
export function AcceptInvitePage() {
  const { token = '' } = useParams();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const toast = useToast();

  const [status, setStatus] = useState<Status>('loading');
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!user) return; // Signed-out visitors get the sign-in prompt, not a preview.
    let active = true;
    setStatus('loading');
    invitationsApi
      .preview(token)
      .then((inv) => {
        if (!active) return;
        setInvitation(inv);
        setStatus('ready');
      })
      .catch((err) => {
        if (!active) return;
        setErrorMsg((err as NormalizedError).message);
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [user, token]);

  async function onAccept() {
    setAccepting(true);
    try {
      const { boardId } = await invitationsApi.accept(token);
      toast('Invitation accepted', 'success');
      navigate(boardId ? `/board/${boardId}` : '/app', { replace: true });
    } catch (err) {
      const message = (err as NormalizedError).message;
      setErrorMsg(message);
      setStatus('error');
      toast(message, 'error');
    } finally {
      setAccepting(false);
    }
  }

  const shell = (children: ReactNode) => (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-slate-50 via-white to-brand-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30">
            <Shapes className="h-5 w-5" />
          </span>
          <span className="text-xl font-bold tracking-tight text-slate-900">CollabBoard</span>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/60">
          {children}
        </div>
      </div>
    </div>
  );

  // Signed-out: bounce through auth, carrying the invite path so we return here.
  if (!user) {
    const returnTo = `/accept-invite/${token}`;
    return shell(
      <div className="flex flex-col items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Users className="h-7 w-7" />
        </span>
        <h1 className="text-xl font-semibold text-slate-900">You&apos;ve been invited</h1>
        <p className="text-sm text-slate-500">
          Sign in or create an account to accept this invitation.
        </p>
        <div className="mt-2 flex w-full flex-col gap-2">
          <Link
            to="/login"
            state={{ from: returnTo }}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-600 px-5 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            Sign in
          </Link>
          <Link
            to="/register"
            state={{ from: returnTo }}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Create an account
          </Link>
        </div>
      </div>,
    );
  }

  if (status === 'loading') {
    return shell(
      <div className="flex flex-col items-center gap-3 py-4">
        <Spinner />
        <p className="text-sm text-slate-500">Loading invitation…</p>
      </div>,
    );
  }

  if (status === 'error') {
    return shell(
      <div className="flex flex-col items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <XCircle className="h-7 w-7" />
        </span>
        <h1 className="text-xl font-semibold text-slate-900">Invitation unavailable</h1>
        <p className="text-sm text-slate-500">
          {errorMsg || 'This invitation is no longer valid or has expired.'}
        </p>
        <Link
          to="/app"
          className="mt-2 inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Go to dashboard
        </Link>
      </div>,
    );
  }

  // status === 'ready'
  const emailMismatch = invitation != null && invitation.email !== user.email;
  return shell(
    <div className="flex flex-col items-center gap-3">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Users className="h-7 w-7" />
      </span>
      <h1 className="text-xl font-semibold text-slate-900">
        Join the {invitation?.boardId ? 'board' : 'workspace'}
      </h1>
      <p className="text-sm text-slate-500">
        You&apos;ve been invited to collaborate as{' '}
        <span className="font-medium text-slate-700">{invitation?.role}</span>.
      </p>

      {emailMismatch && (
        <div className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-700">
          This invite was sent to <span className="font-medium">{invitation?.email}</span>, but
          you&apos;re signed in as <span className="font-medium">{user.email}</span>. Sign in with
          the invited account to accept it.
        </div>
      )}

      <Button
        size="lg"
        loading={accepting}
        onClick={onAccept}
        disabled={emailMismatch}
        className="mt-2 w-full"
      >
        Accept invitation
      </Button>
      <Link to="/app" className="text-xs font-medium text-slate-500 hover:text-slate-700">
        Not now
      </Link>
    </div>,
  );
}
