import { toast } from 'sonner';

export type ApiRole = 'resident' | 'ldrrmo_staff' | 'supervisor' | 'admin';
export type ApiStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type ApiSeverity = 'low' | 'moderate' | 'high' | 'critical';
export type ApiEmergencyType =
  | 'fire'
  | 'flood'
  | 'medical'
  | 'accident'
  | 'landslide'
  | 'earthquake'
  | 'other';
export type ApiSensorType = 'water_level' | 'rainfall' | 'wind_speed' | 'temperature';

export interface ApiUser {
  id: number;
  full_name: string;
  email: string;
  role: ApiRole;
}

export interface ApiProfile extends ApiUser {
  phone: string | null;
  address: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiReport {
  id: number;
  emergency_type: ApiEmergencyType;
  severity: ApiSeverity;
  status: ApiStatus;
  description: string | null;
  location: string;
  latitude: number | null;
  longitude: number | null;
  reporter_name: string;
  created_at: string;
}

export interface ApiSensor {
  id: number;
  device_code: string;
  name: string;
  sensor_type: ApiSensorType;
  unit: string;
  latitude: number;
  longitude: number;
  alert_threshold: number;
  status: 'active' | 'inactive';
  last_reading: number | null;
  last_reading_at: string | null;
  is_alert: boolean;
}

export interface ApiDashboard {
  stats: {
    active_incidents: number;
    flood_sensors: number;
    total_responders: number;
    total_reports: number;
  };
  reports: ApiReport[];
  map_reports: ApiReport[];
  sensors: ApiSensor[];
}

export interface ApiReportPage {
  items: ApiReport[];
  total: number;
  page: number;
  per_page: number;
}

const API_URL = import.meta.env.VITE_API_URL || '/api/index.php';

let csrfToken: string | null = null;
const lastReadErrors = new Map<string, number>();

function surfaceReadError(message: string) {
  const now = Date.now();
  if (now - (lastReadErrors.get(message) ?? 0) < 30000) return;
  lastReadErrors.set(message, now);
  toast.error(message);
}

interface ApiResponse<T> {
  data?: T;
  error?: { message?: string };
}

export async function apiRequest<T>(
  action: string,
  options: RequestInit = {},
  query: Record<string, string> = {},
): Promise<T> {
  const url = new URL(API_URL, window.location.origin);
  url.searchParams.set('action', action);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));

  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (csrfToken && options.method && options.method !== 'GET') {
    headers.set('X-CSRF-Token', csrfToken);
  }

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers, credentials: 'include' });
  } catch {
    const message = `Cannot reach the API at ${API_URL}. Check the API URL and server status.`;
    if (!options.method || options.method === 'GET') surfaceReadError(message);
    throw new Error(message);
  }

  let body: ApiResponse<T>;
  try {
    body = (await response.json()) as ApiResponse<T>;
  } catch {
    const message = `The API returned an invalid response (${response.status}).`;
    if (!options.method || options.method === 'GET') surfaceReadError(message);
    throw new Error(message);
  }
  if (!response.ok) {
    const message = body.error?.message ?? `API request failed (${response.status}).`;
    if (!options.method || options.method === 'GET') surfaceReadError(message);
    throw new Error(message);
  }
  if (!('data' in body)) {
    throw new Error('The API response did not include the expected data.');
  }
  return body.data as T;
}

export function getApiSession() {
  return apiRequest<{ authenticated: boolean; user: ApiUser | null; csrf_token: string }>('session')
    .then(session => {
      csrfToken = session.csrf_token;
      return session;
    });
}

export async function apiLogin(email: string, password: string) {
  const session = await apiRequest<{ user: ApiUser; csrf_token: string }>(
    'login',
    { method: 'POST', body: JSON.stringify({ email, password }) },
  );
  csrfToken = session.csrf_token;
  return session;
}

export function apiLogout() {
  return apiRequest<{ csrf_token: string }>('logout', { method: 'POST' }).then(session => {
    csrfToken = session.csrf_token;
  });
}

export function getApiDashboard() {
  return apiRequest<ApiDashboard>('dashboard');
}

export function getApiReports(page: number) {
  return apiRequest<ApiReportPage>('reports', {}, { page: String(page) });
}

export function createApiReport(report: {
  emergency_type: ApiEmergencyType;
  severity: ApiSeverity;
  description: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
}) {
  return apiRequest<ApiReport>('reports', { method: 'POST', body: JSON.stringify(report) });
}

export function updateApiReportStatus(id: number, status: ApiStatus) {
  return apiRequest<ApiReport>(
    'report-status',
    { method: 'PATCH', body: JSON.stringify({ status }) },
    { id: String(id) },
  );
}

export function registerApiSensor(sensor: {
  name: string;
  sensor_type: ApiSensorType;
  latitude: number;
  longitude: number;
  alert_threshold: number;
}) {
  return apiRequest<ApiSensor & { device_token: string }>(
    'sensors',
    { method: 'POST', body: JSON.stringify(sensor) },
  );
}

export function registerApiUser(payload: {
  full_name: string; email: string; password: string; phone: string; address: string;
}) {
  return apiRequest<{ user: ApiUser; csrf_token: string }>('register', {
    method: 'POST', body: JSON.stringify(payload),
  }).then(session => {
    csrfToken = session.csrf_token;
    return session;
  });
}

export async function uploadReportMedia(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  return apiRequest<{ path: string }>('report-media', { method: 'POST', body: form }).then(result => result.path);
}

export function getPrivateMediaUrl(path: string) {
  const url = new URL(API_URL, window.location.origin);
  url.searchParams.set('action', 'report-media');
  url.searchParams.set('path', path);
  return url.toString();
}
