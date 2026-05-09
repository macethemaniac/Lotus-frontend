import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { GoogleIcon, TwitterIcon, MailIcon } from '@/components/icons/lotus-icons';

const AuthButton = ({ icon, label, onClick, disabled = false }: { icon: ReactNode; label: string; onClick?: () => void; disabled?: boolean }) => (
  <button 
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all group disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lotus-500"
  >
    <div className="w-5 h-5 flex items-center justify-center text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">
      {icon}
    </div>
    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-200">{label}</span>
  </button>
);

export function AuthPageMockup({
  onEmailSubmit,
  onGoogleLogin,
  onTwitterLogin,
  loading = false,
  error,
}: {
  onEmailSubmit?: (email: string) => Promise<void> | void;
  onGoogleLogin?: () => Promise<void> | void;
  onTwitterLogin?: () => Promise<void> | void;
  loading?: boolean;
  error?: string | null;
}) {
  const [email, setEmail] = useState("");

  const submitEmail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onEmailSubmit?.(email);
  };

  return (
    <div className="dark animate-fade-in">
      <div className="min-h-screen flex items-center justify-center p-4 bg-black">
          
          {/* Modal Container */}
          <div className="w-full max-w-[400px] bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-8 animate-in fade-in zoom-in-95 duration-300">
            
            {/* Header */}
            <div className="flex flex-col items-center mb-8 space-y-4">
              <img
                src="/brand/lotus-auth-logo.png"
                alt="Lotus"
                className="mb-2 h-16 w-16 rounded-full object-cover"
              />
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Log in or sign up</h3>
            </div>

            {/* Content */}
            <div className="space-y-3">
              {/* Email Input Row */}
              <form className="relative group" onSubmit={submitEmail}>
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">
                  <MailIcon className="w-5 h-5" />
                </div>
                <label htmlFor="lotus-auth-email" className="sr-only">Email address</label>
                <input 
                  id="lotus-auth-email"
                  type="email" 
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com" 
                  autoComplete="email"
                  className="w-full pl-12 pr-20 py-3.5 bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white placeholder-zinc-400 outline-none focus:ring-2 focus:ring-lotus-500/50 focus:border-lotus-500 transition-all"
                />
                <button
                  type="submit"
                  disabled={loading || !email}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded-md text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lotus-500"
                >
                  {loading ? "..." : "Submit"}
                </button>
              </form>

              {error ? (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300">
                  {error}
                </div>
              ) : null}

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-200 dark:border-zinc-800"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase tracking-wider">
                  <span className="bg-white dark:bg-zinc-900 px-3 text-zinc-400">or</span>
                </div>
              </div>

              <AuthButton icon={<GoogleIcon />} label="Continue with Google" onClick={onGoogleLogin} disabled={loading} />
              <AuthButton icon={<TwitterIcon />} label="Continue with Twitter" onClick={onTwitterLogin} disabled={loading} />
            </div>

            <div className="mt-8 text-center">
              <p className="text-xs text-zinc-400">
                By continuing, you agree to our <a href="#" className="underline hover:text-zinc-900 dark:hover:text-zinc-300">Terms</a> and <a href="#" className="underline hover:text-zinc-900 dark:hover:text-zinc-300">Privacy Policy</a>.
              </p>
            </div>

          </div>
        </div>
    </div>
  );
}
