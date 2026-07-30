import { useToastStore, type ToastType } from '../stores/toastStore';

/** Convenience hook: `const toast = useToast(); toast('Saved', 'success')`. */
export function useToast() {
  const push = useToastStore((s) => s.push);
  return (message: string, type: ToastType = 'info') => push(message, type);
}
