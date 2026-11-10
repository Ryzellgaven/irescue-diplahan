import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getIotDevices, getOperationsSummary, getStaffProfiles } from '@/lib/api';
import type { EmergencyReport, IotDevice } from '@/types/index';
import DashboardMap from './DashboardMap';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Activity, AlertTriangle, ArrowUpRight, Bell, Clock, FileText,
  MapPin, Radio, ShieldAlert, Users, Waves,
} from 'lucide-react';
import { format } from 'date-fns';

const reportStatusColor: Record<string, string> = {
  open: 'bg-amber-100 text-amber-800',
  in_progress: 'bg-sky-100 text-sky-800',
  resolved: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-slate-100 text-slate-700',
};

const emergencyIcon: Record<string, typeof AlertTriangle> = {
  fire: AlertTriangle,
  flood: Waves,
  medical: Activity,
  accident: AlertTriangle,
};

export default function OperationsCenter() {
  const [recentReports, setRecentReports] = useState<EmergencyReport[]>([]);
  const [devices, setDevices] = useState<IotDevice[]>([]);
  const [counts, setCounts] = useState({ open: 0, in_progress: 0, resolved: 0, total: 0 });
  const [responderCount, setResponderCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [summary, devData, staff] = await Promise.all([
      getOperationsSummary(),
      getIotDevices(),
      getStaffProfiles(),
    ]);
    setRecentReports(summary.reports as EmergencyReport[]);
    setDevices(devData);
    setCounts(summary.counts);
    setResponderCount(staff.length);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const activeIncidents = counts.open + counts.in_progress;
  const floodSensors = devices.filter(d =>
    d.status === 'active' && (d.sensor_type === 'water_level' || d.sensor_type === 'rainfall'),
  );
  const alertDevices = devices.filter(d => d.last_reading !== null && d.last_reading >= d.alert_threshold);
  const statCards = [
    { label: 'Active Incidents', value: activeIncidents, icon: AlertTriangle, tone: 'red' },
    { label: 'Flood Sensors', value: floodSensors.length, icon: Waves, tone: 'blue' },
    { label: 'Total Responders', value: responderCount, icon: Users, tone: 'green' },
    { label: 'Total Reports', value: counts.total, icon: FileText, tone: 'amber' },
  ];

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">LDRRMO Operations</p>
          <h1 className="text-xl font-bold text-slate-900">Operations Dashboard</h1>
          <p className="mt-1 text-xs text-slate-500">Live emergency response and flood monitoring overview · refreshes every 15 seconds</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {statCards.map(({ label, value, icon: Icon, tone }) => {
          const tones: Record<string, string> = {
            red: 'bg-red-50 text-red-700 ring-red-100',
            blue: 'bg-sky-50 text-sky-700 ring-sky-100',
            green: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
            amber: 'bg-amber-50 text-amber-700 ring-amber-100',
          };
          return (
            <div key={label} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ${tones[tone]}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                {loading
                  ? <Skeleton className="mb-1 h-6 w-12" />
                  : <p className="text-xl font-bold leading-tight text-slate-900">{value}</p>}
                <p className="truncate text-[11px] text-slate-500">{label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {alertDevices.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Sensor threshold exceeded</p>
            <p className="mt-0.5 text-xs text-red-800">
              {alertDevices.map(d => `${d.name}: ${d.last_reading} ${d.alert_unit}`).join(' · ')}
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="h-8 shrink-0 border-red-200 bg-white text-red-800 hover:bg-red-100">
            <Link to="/dashboard/iot">View sensors</Link>
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(300px,0.9fr)]">
        <section aria-label="Incident and flood monitoring map" className="min-h-[390px]">
          <DashboardMap embedded />
        </section>

        <div className="grid min-h-[390px] grid-rows-2 gap-4">
          <section className="min-h-0 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-800">Recent Emergency Reports</h2>
              <Link to="/dashboard/reports" className="inline-flex items-center text-[11px] font-semibold text-primary hover:underline">
                View all <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="divide-y divide-slate-100 overflow-y-auto">
              {loading ? (
                <div className="space-y-3 p-4">
                  {[0, 1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : recentReports.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center text-center">
                  <FileText className="mb-2 h-6 w-6 text-slate-300" />
                  <p className="text-xs text-slate-500">No emergency reports yet.</p>
                </div>
              ) : recentReports.map(report => {
                const Icon = emergencyIcon[report.emergency_type] ?? ShieldAlert;
                return (
                  <Link
                    key={report.id}
                    to="/dashboard/reports"
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
                  >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-700">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold capitalize text-slate-800">{report.emergency_type}</span>
                        <span className={`rounded px-2 py-0.5 text-[9px] font-semibold ${reportStatusColor[report.status] ?? 'bg-slate-100 text-slate-700'}`}>
                          {report.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-slate-500">{report.address_text || 'Location not provided'}</p>
                      <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
                        <Clock className="h-3 w-3" />
                        {format(new Date(report.created_at), 'MMM d, yyyy h:mm a')}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="min-h-0 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <Waves className="h-4 w-4 text-sky-700" />
                <h2 className="text-sm font-bold text-slate-800">Flood Monitoring</h2>
              </div>
              <Link to="/dashboard/iot" className="inline-flex items-center text-[11px] font-semibold text-primary hover:underline">
                View all <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-[1.2fr_1fr_0.8fr] gap-2 bg-slate-50 px-4 py-2 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
              <span>Sensor / Location</span><span>Last reading</span><span>Status</span>
            </div>
            <div className="divide-y divide-slate-100 overflow-y-auto">
              {loading ? (
                <div className="space-y-2 p-4">{[0, 1, 2].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : floodSensors.length === 0 ? (
                <div className="flex h-24 items-center justify-center px-4 text-center text-xs text-slate-500">
                  No active flood sensors are registered.
                </div>
              ) : floodSensors.slice(0, 5).map(device => {
                const isAlert = device.last_reading !== null && device.last_reading >= device.alert_threshold;
                return (
                  <div key={device.id} className="grid grid-cols-[1.2fr_1fr_0.8fr] items-center gap-2 px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${device.status === 'active' ? 'bg-sky-600' : 'bg-slate-400'}`} />
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold text-slate-700">{device.device_code}</p>
                        <p className="truncate text-[9px] text-slate-400">{device.name}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-medium ${isAlert ? 'text-red-700' : 'text-slate-600'}`}>
                      {device.last_reading === null ? 'No data' : `${device.last_reading} ${device.alert_unit}`}
                    </span>
                    <span className={`w-fit rounded-full px-2 py-0.5 text-[9px] font-semibold ${isAlert ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {isAlert ? 'Alert' : 'Normal'}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Incoming Reports', href: '/dashboard/reports', icon: FileText, detail: 'Review and assign incidents' },
          { label: 'Incident Map', href: '/dashboard/map', icon: MapPin, detail: 'Open full-screen map' },
          { label: 'IoT Monitoring', href: '/dashboard/iot', icon: Waves, detail: 'Review live sensor readings' },
          { label: 'Broadcast Alert', href: '/dashboard/broadcast', icon: Radio, detail: 'Send an emergency update' },
        ].map(({ label, href, icon: Icon, detail }) => (
          <Link key={href} to={href} className="group flex min-h-[82px] items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-red-200 hover:shadow-md">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-red-50 text-primary transition group-hover:bg-primary group-hover:text-white">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-800">{label}</p>
              <p className="mt-0.5 line-clamp-2 text-[10px] text-slate-500">{detail}</p>
            </div>
            <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </div>
  );
}
