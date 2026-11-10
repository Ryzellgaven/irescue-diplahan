import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { getApiSession, registerApiUser } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Activity, AlertTriangle, ArrowRight, Bell, Eye, EyeOff, MapPin, Shield, UserPlus } from 'lucide-react';

const schema = z.object({
  full_name: z.string().min(2, 'Full name is required'),
  email: z.string().email('Enter a valid email'),
  phone: z.string().min(10, 'Enter a valid phone number'),
  address: z.string().min(5, 'Address is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm_password: z.string(),
  agreed: z.literal(true, { errorMap: () => ({ message: 'You must agree to the terms' }) }),
}).refine(d => d.password === d.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
});
type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();

  const form = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormData) => {
    setLoading(true);
    try {
      await getApiSession();
      await registerApiUser({
        full_name: values.full_name, email: values.email, password: values.password,
        phone: values.phone, address: values.address,
      });
      await refreshProfile();
      toast.success('Account created! Welcome to LDRRMO Diplahan.');
      navigate('/resident', { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="dashboard-theme min-h-screen bg-[#f2f4f5] text-slate-900 md:flex">
      <section className="relative hidden min-h-screen overflow-hidden bg-[#74151d] px-8 py-10 text-white md:flex md:w-[42%] md:flex-col md:justify-between lg:px-12 lg:py-12">
        <div className="tactical-grid pointer-events-none absolute inset-0 opacity-[0.12]" />
        <div className="pointer-events-none absolute -right-40 top-[30%] h-[30rem] w-[30rem] rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-24 top-[36%] h-[22rem] w-[22rem] rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -bottom-36 -left-24 h-72 w-[140%] rotate-[-8deg] rounded-[50%] bg-[#5a1118]/70" />

        <div className="relative z-10">
          <Link to="/" className="inline-flex items-center gap-4 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/70 bg-white shadow-lg">
              <Shield className="h-9 w-9 fill-[#86151f] text-[#86151f]" strokeWidth={1.5} />
              <AlertTriangle className="absolute h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Municipality of Diplahan</p>
              <p className="mt-1 text-lg font-bold leading-tight">Emergency Response System</p>
            </div>
          </Link>

          <div className="mt-20 max-w-lg">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-white/65">Resident Portal</p>
            <h1 className="text-4xl font-bold leading-tight tracking-tight lg:text-5xl">
              Help starts<br />with being connected.
            </h1>
            <p className="mt-5 max-w-md text-sm leading-6 text-white/75">
              Create your account to report emergencies, receive important updates, and find help when your community needs it.
            </p>
          </div>
        </div>

        <div className="relative z-10 my-10 grid gap-3">
          {[
            { icon: Activity, title: 'Report emergencies', text: 'Send incident details directly to LDRRMO.' },
            { icon: MapPin, title: 'Share your location', text: 'Help responders find the reported incident.' },
            { icon: Bell, title: 'Stay informed', text: 'Receive updates and community alerts.' },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex items-center gap-4 rounded-lg border border-white/15 bg-white/[0.07] p-4 backdrop-blur-sm">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/10">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-0.5 text-xs text-white/65">{text}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="relative z-10 text-xs text-white/60">Sa Ligtas na Komunidad, Bawat Isa ay Mahalaga.</p>
      </section>

      <section className="flex min-h-screen flex-1 items-center justify-center px-4 py-8 sm:px-8 lg:px-12">
        <div className="w-full max-w-2xl rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.10)] sm:p-8 lg:p-10">
          <div className="mb-7 flex items-center gap-3 md:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#89151f] text-white shadow-sm">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#89151f]">LDRRMO Diplahan</p>
              <p className="text-[11px] text-slate-500">Resident Portal</p>
            </div>
          </div>

          <div className="mb-7">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#89151f]">Join your community</p>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Create your account</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Register as a resident to access emergency reporting and local safety updates.
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                <FormField control={form.control} name="full_name" render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className="text-xs font-semibold text-slate-700">Full Name</FormLabel>
                    <FormControl><Input autoComplete="name" placeholder="Juan Dela Cruz" className="h-11 rounded-lg border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:ring-[#89151f]" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className="text-xs font-semibold text-slate-700">Email Address</FormLabel>
                    <FormControl><Input type="email" autoComplete="email" placeholder="you@example.com" className="h-11 rounded-lg border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:ring-[#89151f]" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className="text-xs font-semibold text-slate-700">Phone Number</FormLabel>
                    <FormControl><Input type="tel" autoComplete="tel" placeholder="09XXXXXXXXX" className="h-11 rounded-lg border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:ring-[#89151f]" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="address" render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className="text-xs font-semibold text-slate-700">Home Address</FormLabel>
                    <FormControl><Input autoComplete="street-address" placeholder="Barangay, Diplahan, Zamboanga Sibugay" className="h-11 rounded-lg border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:ring-[#89151f]" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="password" render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className="text-xs font-semibold text-slate-700">Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input type={showPw ? 'text' : 'password'} autoComplete="new-password" placeholder="At least 8 characters" className="h-11 rounded-lg border-slate-200 bg-white px-3 pr-10 text-sm shadow-sm focus-visible:ring-[#89151f]" {...field} />
                        <button type="button" aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-slate-400 hover:text-[#89151f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#89151f]">
                          {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="confirm_password" render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className="text-xs font-semibold text-slate-700">Confirm Password</FormLabel>
                    <FormControl>
                      <Input type={showPw ? 'text' : 'password'} autoComplete="new-password" placeholder="Re-enter your password" className="h-11 rounded-lg border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:ring-[#89151f]" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="agreed" render={({ field }) => (
                <FormItem>
                  <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
                    <FormControl>
                      <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} className="mt-0.5 data-[state=checked]:border-[#89151f] data-[state=checked]:bg-[#89151f]" />
                    </FormControl>
                    <div className="text-xs leading-relaxed text-slate-600">
                      I agree to the{' '}
                      <span className="cursor-pointer font-medium text-[#89151f] hover:underline">User Agreement</span>
                      {' '}and{' '}
                      <span className="cursor-pointer font-medium text-[#89151f] hover:underline">Privacy Policy</span>
                      {' '}of the LDRRMO Diplahan Emergency Response System.
                    </div>
                  </div>
                  <FormMessage />
                </FormItem>
              )} />

              <Button type="submit" disabled={loading} className="h-12 w-full rounded-lg bg-[#89151f] text-sm font-semibold text-white shadow-sm transition hover:bg-[#70111a] focus-visible:ring-[#89151f]">
                {loading
                  ? <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  : <>Create Resident Account <ArrowRight className="ml-2 h-4 w-4" /></>
                }
              </Button>
            </form>
          </Form>

          <div className="mt-6 border-t border-slate-100 pt-5 text-center">
            <p className="text-sm text-slate-500">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-[#89151f] hover:underline">Sign in</Link>
            </p>
            <Link to="/" className="mt-3 inline-block text-xs text-slate-400 hover:text-slate-700">← Back to home</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
