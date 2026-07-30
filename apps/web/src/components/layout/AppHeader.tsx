import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, LayoutDashboard, LogOut } from 'lucide-react';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../stores/authStore';
import { Avatar } from '../ui/Avatar';

interface AppHeaderProps {
  /** Optional right-side slot rendered just before the user menu. */
  children?: ReactNode;
}

/**
 * Global top bar: brand wordmark on the left, an optional page-specific slot,
 * then the signed-in user's avatar with a logout menu. Kept intentionally thin
 * so every authenticated page can drop it in without extra wiring.
 */
export function AppHeader({ children }: AppHeaderProps) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Dismiss the dropdown on any outside click while it is open.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const handleLogout = async () => {
    // Revoke server-side, but clear local state regardless of the network result.
    try {
      await authApi.logout();
    } catch {
      /* ignore — a stale/expired refresh cookie still means "logged out" locally */
    }
    clear();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/app" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <LayoutDashboard className="h-5 w-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight text-slate-800">
            Collab<span className="text-brand-600">Board</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {children}

          {user && (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-full p-0.5 pr-1.5 transition hover:bg-slate-100"
                aria-haspopup="menu"
                aria-expanded={open}
              >
                <Avatar name={user.name} color={user.avatarColor} size={32} />
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>

              {open && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg animate-slide-up"
                >
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="truncate text-sm font-semibold text-slate-800">{user.name}</p>
                    <p className="truncate text-xs text-slate-500">{user.email}</p>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                  >
                    <LogOut className="h-4 w-4 text-slate-400" />
                    Log out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
