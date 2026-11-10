import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { getApiSession, apiLogin } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import {
  Activity, ArrowRight, Eye, EyeOff, LockKeyhole, Mail, Map,
  MapPin, Shield, TriangleAlert, UserPlus, Waves,
} from 'lucide-react';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
type FormData = z.infer<typeof schema>;

const roleRedirect: Record<string, string> = {
  resident: '/resident',
  ldrrmo_staff: '/dashboard',
  supervisor: '/dashboard',
  admin: '/dashboard',
};

const features = [
  { icon: TriangleAlert, title: 'Emergency Reporting', detail: 'Report incidents quickly and easily.' },
  { icon: MapPin, title: 'Real-Time Location', detail: 'Know where help is needed.' },
  { icon: Map, title: 'GIS Mapping', detail: 'Visualize incidents and affected areas.' },
  { icon: Waves, title: 'IoT Flood Monitoring', detail: 'Monitor water levels in real time.' },
  { icon: Activity, title: 'LDRRMO Dashboard', detail: 'Track and manage reports and data.' },
];

function Landscape() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 1200 900"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="login-sky" x1="0" y1="0" x2="0.9" y2="1">
          <stop stopColor="#281217" />
          <stop offset=".52" stopColor="#5a171e" />
          <stop offset="1" stopColor="#230e14" />
        </linearGradient>
        <linearGradient id="login-hill" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#35151a" />
          <stop offset="1" stopColor="#180e13" />
        </linearGradient>
      </defs>
      <rect width="1200" height="900" fill="url(#login-sky)" />
      <circle cx="900" cy="206" r="130" fill="#f6c7a6" opacity=".08" />
      <path d="M0 316 110 282 193 301 287 248 364 270 451 208 538 248 630 171 716 223 806 185 896 250 980 208 1085 275 1200 231V900H0Z" fill="#220f15" opacity=".78" />
      <path d="M0 389 109 337 194 359 293 306 390 354 486 291 587 345 692 286 788 334 886 273 980 339 1081 298 1200 352V900H0Z" fill="url(#login-hill)" />
      <path d="M0 500 134 414 231 452 329 387 425 431 531 367 630 423 747 359 841 412 960 359 1052 420 1149 382 1200 407V900H0Z" fill="#190e13" opacity=".85" />
      <path d="M0 758c161-81 273-31 403 2s255 31 385-10 272-48 412 3v147H0Z" fill="#80131e" />
      <path d="M0 808c159 22 297-29 429-25 165 5 223 47 379 26 150-20 252-45 392-18v109H0Z" fill="#560e17" />
      <path d="M0 0h1200v900H0Z" fill="#180b10" opacity=".2" />
    </svg>
  );
}

export default function LoginPage() {
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const { refreshProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname;
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: FormData) => {
    setLoading(true);
    try {
      await getApiSession();
      const { user } = await apiLogin(values.email, values.password);
      await refreshProfile();
      const dest = from || roleRedirect[user.role] || '/resident';
      toast.success('Welcome back!');
      navigate(dest, { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#260f15] text-slate-900 md:flex">
      <section className="relative hidden min-h-screen overflow-hidden text-white md:flex md:w-[55%] md:flex-col md:justify-between md:px-8 md:py-12 lg:px-8">
        <Landscape />
        <div className="absolute inset-0 bg-gradient-to-r from-[#260e14]/35 via-transparent to-[#260e14]/25" />
        <div className="relative z-10">
          <Link to="/" className="inline-flex items-center gap-4 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            <div className="relative flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full border-2 border-white/70 bg-[#f8fafc] shadow-lg">
              <Shield className="h-12 w-12 fill-[#86151f] text-[#86151f]" strokeWidth={1.5} />
              <TriangleAlert className="absolute h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight tracking-tight lg:text-3xl">Diplahan</h1>
              <p className="text-lg font-semibold leading-tight lg:text-xl">Emergency Response System</p>
              <p className="mt-2 text-xs text-white/75 lg:text-sm">GIS-Based Emergency &amp; Flood Monitoring</p>
            </div>
          </Link>
          <p className="mt-7 max-w-xs border-t border-white/30 pt-3 text-xs italic leading-relaxed text-white/75">
            Sa Ligtas na Komunidad,<br />Bawat Isa ay Mahalaga.
          </p>
        </div>

        <div className="relative z-10 mx-auto grid w-full max-w-xl grid-cols-6 gap-x-5 gap-y-7">
          {features.map(({ icon: Icon, title, detail }, index) => (
            <div key={title} className={`col-span-2 text-center ${index === 3 ? 'col-start-2' : index === 4 ? 'col-start-4' : ''}`}>
              <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-[#941722] shadow-lg ring-1 ring-white/10">
                <Icon className="h-5 w-5 text-white" strokeWidth={2} />
              </div>
              <p className="text-xs font-semibold leading-snug">{title}</p>
              <p className="mx-auto mt-1 max-w-[145px] text-[10px] leading-relaxed text-white/70">{detail}</p>
            </div>
          ))}
        </div>
        <p className="relative z-10 text-xs text-white/60">Diplahan, Zamboanga Sibugay · Philippines</p>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-[#8b1420] [clip-path:polygon(0_32%,10%_84%,28%_100%,47%_58%,62%_82%,81%_68%,100%_100%,100%_100%,0_100%)]" />
      </section>

      <section className="flex min-h-screen flex-1 items-center justify-center bg-[#f2f4f5] px-4 py-8 sm:px-8 md:w-[45%] md:px-8">
        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.16)] sm:p-8">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-b-[1.8rem] rounded-t-lg bg-[#89151f] shadow-md">
            <TriangleAlert className="h-8 w-8 text-white" strokeWidth={1.8} />
          </div>
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-bold tracking-tight text-slate-800">Welcome Back!</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Log in to your account to access the<br className="hidden sm:block" /> Emergency Response System.
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-xs font-semibold text-slate-700">Email</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        type="email"
                        autoComplete="username"
                        placeholder="Enter your email"
                        className="h-11 rounded-md border-slate-300 bg-white pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:ring-[#8b1420]"
                        style={{ paddingLeft: '2.5rem' }}
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-xs font-semibold text-slate-700">Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        type={showPw ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="Enter your password"
                        className="h-11 rounded-md border-slate-300 bg-white px-10 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:ring-[#8b1420]"
                        style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
                        {...field}
                      />
                      <button
                        type="button"
                        aria-label={showPw ? 'Hide password' : 'Show password'}
                        onClick={() => setShowPw(value => !value)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-slate-500 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b1420]"
                      >
                        {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <p className="text-right text-[11px] text-slate-500">
                Forgot your password? Contact your system administrator.
              </p>

              <Button
                type="submit"
                disabled={loading}
                className="h-11 w-full rounded-md bg-[#89151f] text-sm font-semibold text-white shadow-sm hover:bg-[#70111a] focus-visible:ring-[#89151f]"
              >
                {loading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <>Log In <ArrowRight className="ml-2 h-4 w-4" /></>
                )}
              </Button>
            </form>
          </Form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-[11px] text-slate-400">OR</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <Button asChild variant="outline" className="h-10 w-full border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50">
            <Link to="/register">
              <UserPlus className="mr-2 h-4 w-4 text-[#89151f]" />
              Create a Resident Account
            </Link>
          </Button>
          <p className="mt-4 text-center text-[10px] leading-relaxed text-slate-500">
            Staff accounts are provisioned by an administrator.<br />
            <Link to="/" className="mt-2 inline-block font-medium text-[#89151f] hover:underline">Back to home</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
