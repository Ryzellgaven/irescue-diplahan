type JsonRecord = Record<string, unknown>;
type Role = 'resident' | 'ldrrmo_staff' | 'supervisor' | 'admin';
type ApiUser = {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
};
type Actor = { authId: string; profile: ApiUser };

class ApiError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const projectUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/+$/, '');
const publicKey = Deno.env.get('SUPABASE_ANON_KEY');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!projectUrl || !publicKey || !serviceKey) {
  throw new Error('Supabase URL, anon key, and service-role key are required by the Edge Function.');
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-device-token',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Max-Age': '86400',
};
const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PHOTO_PATH_PATTERN = new RegExp(`^${UUID_PATTERN}/${UUID_PATTERN}\\.(?:jpg|png|webp|gif)$`, 'i');

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data: stringifyIds(data) }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return new Response(JSON.stringify({ error: { message: error.message } }), {
      status: error.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  console.error('[LDRRMO Edge API]', error);
  return new Response(JSON.stringify({ error: { message: 'The server could not complete this request.' } }), {
    status: 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function stringifyIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stringifyIds);
  if (typeof value !== 'object' || value === null) return value;
  const result: JsonRecord = {};
  for (const [key, nested] of Object.entries(value)) {
    if (
      ['id', 'reporter_id', 'assigned_to', 'responder_id', 'assigned_by', 'updated_by',
        'user_id', 'report_id', 'device_id', 'target_user_id', 'sent_by', 'created_by',
        'logged_by', 'notification_id'].includes(key)
      && typeof nested === 'number'
    ) {
      result[key] = String(nested);
    } else {
      result[key] = stringifyIds(nested);
    }
  }
  return result;
}

function apiUrl(path: string, query: Record<string, string> = {}): URL {
  const url = new URL(path, `${projectUrl}/`);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
  return url;
}

function serviceHeaders(prefer?: string): Headers {
  const headers = new Headers({
    apikey: serviceKey!,
    Authorization: `Bearer ${serviceKey}`,
  });
  if (prefer) headers.set('Prefer', prefer);
  return headers;
}

async function supabaseRequest<T>(
  path: string,
  options: { method?: string; query?: Record<string, string>; body?: unknown; prefer?: string } = {},
): Promise<{ data: T; response: Response }> {
  const url = apiUrl(path, options.query);
  const headers = serviceHeaders(options.prefer);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (response.ok) throw new Error('Supabase returned an invalid response.');
    }
  }
  if (!response.ok) {
    const body = typeof data === 'object' && data !== null ? data as JsonRecord : {};
    const message = typeof body.message === 'string'
      ? body.message
      : typeof body.msg === 'string'
        ? body.msg
        : 'Supabase request failed.';
    const status = response.status === 404 ? 404 : response.status >= 400 && response.status < 500 ? 422 : 500;
    throw new ApiError(message, status);
  }
  return { data: data as T, response };
}

async function rows<T extends JsonRecord>(
  table: string,
  query: Record<string, string> = {},
): Promise<T[]> {
  const { data } = await supabaseRequest<T[]>(`rest/v1/${table}`, { query });
  return data ?? [];
}

async function one<T extends JsonRecord>(
  table: string,
  query: Record<string, string>,
): Promise<T | null> {
  const result = await rows<T>(table, { ...query, limit: '1' });
  return result[0] ?? null;
}

async function insert<T extends JsonRecord>(table: string, values: JsonRecord): Promise<T> {
  const { data } = await supabaseRequest<T[]>(`rest/v1/${table}`, {
    method: 'POST',
    query: { select: '*' },
    body: values,
    prefer: 'return=representation',
  });
  if (!data?.[0]) throw new Error(`Supabase did not return the inserted ${table} row.`);
  return data[0];
}

async function update<T extends JsonRecord>(
  table: string,
  query: Record<string, string>,
  values: JsonRecord,
): Promise<T[]> {
  const { data } = await supabaseRequest<T[]>(`rest/v1/${table}`, {
    method: 'PATCH',
    query: { ...query, select: '*' },
    body: values,
    prefer: 'return=representation',
  });
  return data ?? [];
}

async function count(table: string, query: Record<string, string> = {}): Promise<number> {
  const { response } = await supabaseRequest<null>(`rest/v1/${table}`, {
    method: 'HEAD',
    query: { ...query, select: 'id' },
    prefer: 'count=exact',
  });
  const total = response.headers.get('content-range')?.split('/')[1];
  return total && total !== '*' ? Number(total) : 0;
}

async function rpc<T>(functionName: string, parameters: JsonRecord): Promise<T> {
  const { data } = await supabaseRequest<T>(`rest/v1/rpc/${functionName}`, {
    method: 'POST',
    body: parameters,
  });
  return data;
}

function readPageParams(url: URL): { page: number; size: number; offset: number } {
  const page = Math.max(1, Math.min(1_000_000, Number(url.searchParams.get('page') ?? 1) || 1));
  const size = Math.max(1, Math.min(200, Number(url.searchParams.get('per_page') ?? 50) || 50));
  return { page, size, offset: (page - 1) * size };
}

function requiredText(value: unknown, label: string, max: number, optional = false): string | null {
  if (value === null || value === undefined || value === '') {
    if (optional) return null;
    throw new ApiError(`${label} is required.`);
  }
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > max) {
    throw new ApiError(`${label} must be between 1 and ${max} characters.`);
  }
  return value.trim();
}

function validRole(value: unknown): Role {
  if (value === 'resident' || value === 'ldrrmo_staff' || value === 'supervisor' || value === 'admin') return value;
  throw new ApiError('Select a valid role.');
}

function validEnum<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new ApiError(`Select a valid ${label}.`);
  }
  return value as T;
}

function finiteNumber(value: unknown, minimum: number, maximum: number, label: string, nullable = false): number | null {
  if (nullable && (value === null || value === undefined || value === '')) return null;
  if (
    typeof value !== 'number'
    && (typeof value !== 'string' || value.trim() === '')
  ) {
    throw new ApiError(`${label} must be a valid number.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new ApiError(`${label} is outside its valid range.`);
  }
  return parsed;
}

function validId(value: unknown, label = 'ID'): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new ApiError(`A valid ${label} is required.`);
  return parsed;
}

async function readJsonBody(request: Request): Promise<JsonRecord> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 65_536) throw new ApiError('The request body is too large.', 413);
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ApiError('A valid JSON request body is required.', 400);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiError('A valid JSON request body is required.', 400);
  }
  return value as JsonRecord;
}

async function authenticate(request: Request): Promise<Actor> {
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new ApiError('Sign in to continue.', 401);
  const response = await fetch(`${projectUrl}/auth/v1/user`, {
    headers: { apikey: publicKey!, Authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  let authUser: unknown;
  try { authUser = text ? JSON.parse(text) : null; } catch { authUser = null; }
  if (!response.ok || !authUser || typeof authUser !== 'object' || typeof (authUser as JsonRecord).id !== 'string') {
    throw new ApiError('Your session is invalid or has expired. Sign in again.', 401);
  }
  const authId = (authUser as JsonRecord).id as string;
  const profile = await one<JsonRecord>('profiles', {
    select: 'id,email,full_name,role,is_active',
    auth_user_id: `eq.${authId}`,
  });
  if (!profile || profile.is_active !== true) {
    throw new ApiError('This account is inactive or has no linked profile.', 401);
  }
  return { authId, profile: profile as unknown as ApiUser };
}

function requireRole(actor: Actor, roles: readonly Role[]): void {
  if (!roles.includes(actor.profile.role)) throw new ApiError('You are not authorized to perform this action.', 403);
}

const STAFF: Role[] = ['ldrrmo_staff', 'supervisor', 'admin'];
const SUPERVISORS: Role[] = ['supervisor', 'admin'];
const EMERGENCY_TYPES = ['fire', 'flood', 'medical', 'accident', 'landslide', 'earthquake', 'other'] as const;
const SEVERITIES = ['low', 'moderate', 'high', 'critical'] as const;
const STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;

async function audit(
  actorId: number | null,
  action: string,
  tableName: string | null = null,
  recordId: number | string | null = null,
  values: JsonRecord | null = null,
): Promise<void> {
  await insert('audit_logs', {
    user_id: actorId,
    action,
    table_name: tableName,
    record_id: recordId === null ? null : String(recordId),
    new_values: values,
  });
}

function pageResult<T>(items: T[], total: number) {
  return { items, total };
}

async function profilesById(ids: number[]): Promise<Map<number, JsonRecord>> {
  const unique = [...new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0))];
  if (unique.length === 0) return new Map();
  const result = await rows<JsonRecord>('profiles', {
    select: 'id,full_name,phone,role,email',
    id: `in.(${unique.join(',')})`,
  });
  return new Map(result.map(profile => [Number(profile.id), profile]));
}

async function signedPhotoUrl(path: unknown): Promise<string | null> {
  if (typeof path !== 'string' || !PHOTO_PATH_PATTERN.test(path)) return null;
  const objectPath = path.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`${projectUrl}/storage/v1/object/sign/report-photos/${objectPath}`, {
    method: 'POST',
    headers: { ...Object.fromEntries(serviceHeaders().entries()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 3600 }),
  });
  const body = await response.json().catch(() => null) as JsonRecord | null;
  if (!response.ok || typeof body?.signedURL !== 'string') return null;
  if (/^https?:\/\//i.test(body.signedURL)) return body.signedURL;
  return `${projectUrl}/storage/v1${body.signedURL.startsWith('/') ? body.signedURL : `/${body.signedURL}`}`;
}

async function assertPhotoObjectExists(path: string): Promise<void> {
  if (!PHOTO_PATH_PATTERN.test(path)) throw new ApiError('The uploaded photo path is invalid.', 422);
  const objectPath = path.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`${projectUrl}/storage/v1/object/info/report-photos/${objectPath}`, {
    headers: serviceHeaders(),
  });
  if (!response.ok) throw new ApiError('The uploaded photo could not be found in private storage.', 422);
}

async function attachReportProfiles(reports: JsonRecord[]): Promise<JsonRecord[]> {
  const ids = reports.flatMap(report => [Number(report.reporter_id), Number(report.assigned_to)]);
  const profiles = await profilesById(ids);
  return Promise.all(reports.map(async report => {
    const reporter = profiles.get(Number(report.reporter_id));
    const assigned = profiles.get(Number(report.assigned_to));
    return {
      ...report,
      profiles: reporter ? { full_name: reporter.full_name, phone: reporter.phone } : null,
      assigned_profile: assigned ? { full_name: assigned.full_name } : null,
      photo_url: await signedPhotoUrl(report.photo_url),
    };
  }));
}

async function reportPage(
  url: URL,
  actor: Actor,
  mine = false,
): Promise<{ items: JsonRecord[]; total: number }> {
  const { size, offset } = readPageParams(url);
  const filters: Record<string, string> = { select: '*', order: 'created_at.desc,id.desc', limit: String(size), offset: String(offset) };
  if (mine || actor.profile.role === 'resident') filters.reporter_id = `eq.${actor.profile.id}`;
  for (const key of ['status', 'emergency_type', 'severity']) {
    const value = url.searchParams.get(key);
    if (!value) continue;
    const values = key === 'status' ? STATUSES : key === 'severity' ? SEVERITIES : EMERGENCY_TYPES;
    filters[key] = `eq.${validEnum(value, values, key)}`;
  }
  const countFilters = { ...filters };
  delete countFilters.select;
  delete countFilters.order;
  delete countFilters.limit;
  delete countFilters.offset;
  const [total, reports] = await Promise.all([
    count('emergency_reports', countFilters),
    rows<JsonRecord>('emergency_reports', filters),
  ]);
  return pageResult(await attachReportProfiles(reports), total);
}

async function currentReport(actor: Actor, id: number): Promise<JsonRecord> {
  const report = await one<JsonRecord>('emergency_reports', { select: '*', id: `eq.${id}` });
  if (!report) throw new ApiError('Report not found.', 404);
  if (actor.profile.role === 'resident' && Number(report.reporter_id) !== actor.profile.id) {
    throw new ApiError('You are not authorized to view this report.', 403);
  }
  return (await attachReportProfiles([report]))[0];
}

async function getStaffProfiles(): Promise<JsonRecord[]> {
  return rows('profiles', {
    select: 'id,email,full_name,phone,role,is_active,created_at,updated_at',
    is_active: 'eq.true',
    role: 'in.(ldrrmo_staff,supervisor,admin)',
    order: 'full_name.asc',
  });
}

async function getAssignments(reportId: number): Promise<JsonRecord[]> {
  const assignments = await rows<JsonRecord>('report_assignments', {
    select: '*',
    report_id: `eq.${reportId}`,
    order: 'created_at.desc',
  });
  const profiles = await profilesById(assignments.map(assignment => Number(assignment.responder_id)));
  return assignments.map(assignment => ({
    ...assignment,
    profiles: profiles.get(Number(assignment.responder_id)) ?? null,
  }));
}

async function getStatusHistory(reportId: number): Promise<JsonRecord[]> {
  const history = await rows<JsonRecord>('status_updates', {
    select: '*',
    report_id: `eq.${reportId}`,
    order: 'created_at.desc',
  });
  const profiles = await profilesById(history.map(update => Number(update.updated_by)));
  return history.map(update => ({
    ...update,
    profiles: profiles.get(Number(update.updated_by))
      ? { full_name: profiles.get(Number(update.updated_by))?.full_name }
      : null,
  }));
}

async function uploadMedia(request: Request, actor: Actor): Promise<{ path: string }> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 6 * 1024 * 1024) throw new ApiError('Photo must be under 5MB.', 413);
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) throw new ApiError('Choose a valid image to upload.');
  if (file.size > 5 * 1024 * 1024) throw new ApiError('Photo must be under 5MB.', 413);
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  const extension = extensions[file.type];
  if (!extension) throw new ApiError('Only JPEG, PNG, WebP, and GIF images are accepted.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isImage = extension === 'jpg'
    ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : extension === 'png'
      ? bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10'
      : extension === 'gif'
        ? new TextDecoder().decode(bytes.slice(0, 3)) === 'GIF'
        : new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF'
          && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
  if (!isImage) throw new ApiError('The uploaded file content does not match an allowed image type.');

  const path = `${actor.authId}/${crypto.randomUUID()}.${extension}`;
  const objectPath = path.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`${projectUrl}/storage/v1/object/report-photos/${objectPath}`, {
    method: 'POST',
    headers: {
      ...Object.fromEntries(serviceHeaders().entries()),
      'Content-Type': file.type,
      'x-upsert': 'false',
    },
    body: bytes,
  });
  if (!response.ok) throw new ApiError('Could not save the uploaded image.', 500);
  return { path };
}

async function saveDevice(
  request: Request,
  actor: Actor,
  updateExisting: boolean,
  url: URL,
): Promise<JsonRecord> {
  requireRole(actor, ['admin']);
  const body = await readJsonBody(request);
  if (updateExisting) {
    const id = validId(url.searchParams.get('id') ?? body.id, 'device ID');
    const fields: JsonRecord = {};
    if (body.device_code !== undefined) fields.device_code = requiredText(body.device_code, 'Device code', 48);
    if (body.name !== undefined) fields.name = requiredText(body.name, 'Sensor name', 120);
    if (body.sensor_type !== undefined) fields.sensor_type = validEnum(body.sensor_type, ['water_level', 'rainfall', 'wind_speed', 'temperature'], 'sensor type');
    if (body.latitude !== undefined) fields.latitude = finiteNumber(body.latitude, -90, 90, 'Latitude');
    if (body.longitude !== undefined) fields.longitude = finiteNumber(body.longitude, -180, 180, 'Longitude');
    if (body.alert_threshold !== undefined) fields.alert_threshold = finiteNumber(body.alert_threshold, -1_000_000, 1_000_000, 'Threshold');
    if (body.alert_unit !== undefined) fields.alert_unit = requiredText(body.alert_unit, 'Alert unit', 12);
    if (body.status !== undefined) fields.status = validEnum(body.status, ['active', 'inactive', 'maintenance'], 'status');
    if (Object.keys(fields).length === 0) throw new ApiError('No sensor fields were provided.');
    const updated = await update<JsonRecord>('iot_devices', { id: `eq.${id}` }, fields);
    if (!updated[0]) throw new ApiError('IoT device not found.', 404);
    await audit(actor.profile.id, 'iot_device_updated', 'iot_devices', id);
    return {
      id: updated[0].id,
      device_code: updated[0].device_code,
      name: updated[0].name,
      latitude: updated[0].latitude,
      longitude: updated[0].longitude,
      sensor_type: updated[0].sensor_type,
      alert_threshold: updated[0].alert_threshold,
      alert_unit: updated[0].alert_unit,
      status: updated[0].status,
      last_reading: updated[0].last_reading,
      last_reading_at: updated[0].last_reading_at,
      created_at: updated[0].created_at,
      updated_at: updated[0].updated_at,
    };
  }

  const name = requiredText(body.name, 'Sensor name', 120)!;
  const sensorType = validEnum(body.sensor_type, ['water_level', 'rainfall', 'wind_speed', 'temperature'], 'sensor type');
  const defaults: Record<string, string> = { water_level: 'm', rainfall: 'mm', wind_speed: 'm/s', temperature: '°C' };
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(tokenBytes, byte => byte.toString(16).padStart(2, '0')).join('');
  const tokenHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const hash = Array.from(new Uint8Array(tokenHash), byte => byte.toString(16).padStart(2, '0')).join('');
  const created = await insert<JsonRecord>('iot_devices', {
    device_code: body.device_code === undefined
      ? `IOT-${Array.from(crypto.getRandomValues(new Uint8Array(4)), byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}`
      : requiredText(body.device_code, 'Device code', 48),
    name,
    latitude: finiteNumber(body.latitude, -90, 90, 'Latitude'),
    longitude: finiteNumber(body.longitude, -180, 180, 'Longitude'),
    sensor_type: sensorType,
    alert_threshold: finiteNumber(body.alert_threshold ?? 5, -1_000_000, 1_000_000, 'Threshold'),
    alert_unit: body.alert_unit === undefined ? defaults[sensorType] : requiredText(body.alert_unit, 'Alert unit', 12),
    status: validEnum(body.status ?? 'active', ['active', 'inactive', 'maintenance'], 'status'),
    device_token_hash: hash,
  });
  await audit(actor.profile.id, 'iot_device_created', 'iot_devices', Number(created.id));
  const { device_token_hash: _hash, ...visible } = created;
  return { ...visible, device_token: token };
}

async function ingestReading(request: Request): Promise<JsonRecord> {
  const body = await readJsonBody(request);
  const code = requiredText(body.device_code, 'Device code', 48)!;
  const token = request.headers.get('x-device-token') ?? '';
  const reading = finiteNumber(body.reading ?? body.value, -1_000_000, 1_000_000, 'Reading')!;
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new ApiError('A valid device token is required.', 401);
  const device = await one<JsonRecord>('iot_devices', {
    select: 'id,device_token_hash',
    device_code: `eq.${code}`,
    status: 'eq.active',
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const supplied = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const expected = typeof device?.device_token_hash === 'string' ? device.device_token_hash : '';
  let mismatch = supplied.length ^ expected.length;
  for (let index = 0; index < Math.max(supplied.length, expected.length); index += 1) {
    mismatch |= (supplied.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  if (!device || mismatch !== 0) throw new ApiError('The device credentials are invalid.', 401);
  return await rpc<JsonRecord>('record_sensor_reading', {
    p_device_id: device.id,
    p_reading: reading,
  });
}

async function dispatch(request: Request, url: URL, actor: Actor): Promise<{ value: unknown; status?: number }> {
  const action = url.searchParams.get('action') ?? '';
  const method = request.method.toUpperCase();
  const id = () => validId(url.searchParams.get('id'));

  if (action === 'session' && method === 'GET') return { value: { authenticated: true, user: actor.profile } };
  if (action === 'profile' && method === 'GET') {
    const profile = await one<JsonRecord>('profiles', {
      select: 'id,email,full_name,phone,address,role,is_active,avatar_url,created_at,updated_at',
      id: `eq.${actor.profile.id}`,
    });
    return { value: profile };
  }
  if (action === 'profile' && method === 'PATCH') {
    const body = await readJsonBody(request);
    const fields: JsonRecord = {};
    for (const [key, limit] of Object.entries({ full_name: 120, phone: 40, address: 255, avatar_url: 500 })) {
      if (Object.hasOwn(body, key)) fields[key] = requiredText(body[key], key, limit, key !== 'full_name');
    }
    if (Object.keys(fields).length === 0) throw new ApiError('No profile fields were provided.');
    const updated = await update<JsonRecord>('profiles', { id: `eq.${actor.profile.id}` }, fields);
    await audit(actor.profile.id, 'profile_updated', 'profiles', actor.profile.id);
    return { value: updated[0] };
  }
  if (action === 'profiles' && method === 'GET') {
    requireRole(actor, ['admin']);
    const { size, offset } = readPageParams(url);
    const [total, items] = await Promise.all([
      count('profiles'),
      rows<JsonRecord>('profiles', {
        select: 'id,email,full_name,phone,address,role,is_active,avatar_url,created_at,updated_at',
        order: 'created_at.desc',
        limit: String(size),
        offset: String(offset),
      }),
    ]);
    return { value: pageResult(items, total) };
  }
  if (action === 'staff-profiles' && method === 'GET') {
    requireRole(actor, STAFF);
    return { value: await getStaffProfiles() };
  }
  if (action === 'users' && method === 'POST') {
    requireRole(actor, ['admin']);
    const body = await readJsonBody(request);
    const email = requiredText(body.email, 'Email', 254)!.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError('Enter a valid email address.');
    const password = body.password;
    if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
      throw new ApiError('Password must be between 8 and 72 bytes.');
    }
    const role = validRole(body.role);
    const fullName = requiredText(body.full_name, 'Full name', 120)!;
    const createResponse = await fetch(`${projectUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { ...Object.fromEntries(serviceHeaders().entries()), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          phone: requiredText(body.phone, 'Phone', 40, true),
        },
      }),
    });
    const authBody = await createResponse.json().catch(() => null) as JsonRecord | null;
    if (!createResponse.ok || typeof authBody?.id !== 'string') {
      const message = typeof authBody?.msg === 'string' ? authBody.msg : 'Could not create the user account.';
      throw new ApiError(message, createResponse.status === 422 ? 409 : 422);
    }
    const profile = await one<JsonRecord>('profiles', {
      select: 'id,email,full_name,phone,address,role,is_active,avatar_url,created_at,updated_at',
      auth_user_id: `eq.${authBody.id}`,
    });
    if (!profile) {
      await fetch(`${projectUrl}/auth/v1/admin/users/${encodeURIComponent(authBody.id)}`, {
        method: 'DELETE',
        headers: serviceHeaders(),
      });
      throw new Error('The profile trigger did not create the new user profile.');
    }
    const changed = await update<JsonRecord>('profiles', { id: `eq.${profile.id}` }, { role });
    await audit(actor.profile.id, 'user_created', 'profiles', Number(profile.id), { role });
    return { value: changed[0] ?? profile, status: 201 };
  }
  if (action === 'users' && method === 'PATCH') {
    requireRole(actor, ['admin']);
    const userId = validId(url.searchParams.get('id'), 'user ID');
    const body = await readJsonBody(request);
    const fields: JsonRecord = {};
    if (body.full_name !== undefined) fields.full_name = requiredText(body.full_name, 'Full name', 120);
    if (body.phone !== undefined) fields.phone = requiredText(body.phone, 'Phone', 40, true);
    if (body.role !== undefined) fields.role = validRole(body.role);
    if (body.is_active !== undefined) {
      if (typeof body.is_active !== 'boolean') throw new ApiError('is_active must be a boolean.');
      fields.is_active = body.is_active;
    }
    if (Object.keys(fields).length === 0) throw new ApiError('No user fields were provided.');
    const updatedId = await rpc<number>('admin_update_profile', {
      p_actor_id: actor.profile.id,
      p_target_id: userId,
      p_fields: fields,
    });
    const changed = await one<JsonRecord>('profiles', {
      select: 'id,email,full_name,phone,address,role,is_active,avatar_url,created_at,updated_at',
      id: `eq.${updatedId}`,
    });
    if (!changed) throw new Error('Supabase did not return the updated user profile.');
    await audit(actor.profile.id, 'user_updated', 'profiles', userId);
    return { value: changed };
  }
  if (action === 'report-media' && method === 'POST') {
    return { value: await uploadMedia(request, actor), status: 201 };
  }
  if (action === 'reports' && method === 'GET') return { value: await reportPage(url, actor) };
  if (action === 'my-reports' && method === 'GET') return { value: await reportPage(url, actor, true) };
  if (action === 'report' && method === 'GET') return { value: await currentReport(actor, id()) };
  if (action === 'active-reports' && method === 'GET') {
    const active = await rows<JsonRecord>('emergency_reports', {
      select: 'id,emergency_type,severity,status,latitude,longitude,address_text,created_at',
      status: 'in.(open,in_progress)',
      latitude: 'not.is.null',
      order: 'created_at.desc',
      limit: '200',
    });
    return {
      value: active.map(report => ({
        id: report.id,
        emergency_type: report.emergency_type,
        severity: report.severity,
        status: report.status,
        latitude: Math.round(Number(report.latitude) * 1000) / 1000,
        longitude: Math.round(Number(report.longitude) * 1000) / 1000,
        created_at: report.created_at,
      })),
    };
  }
  if (action === 'reports' && method === 'POST') {
    if (actor.profile.role !== 'resident') throw new ApiError('Only residents may submit resident incident reports.', 403);
    const body = await readJsonBody(request);
    const emergencyType = validEnum(body.emergency_type ?? 'other', EMERGENCY_TYPES, 'emergency type');
    const severity = validEnum(body.severity ?? 'moderate', SEVERITIES, 'severity');
    const latitude = finiteNumber(body.latitude, -90, 90, 'Latitude', true);
    const longitude = finiteNumber(body.longitude, -180, 180, 'Longitude', true);
    if ((latitude === null) !== (longitude === null)) throw new ApiError('Provide both coordinates, or leave both empty.');
    const address = requiredText(body.address_text ?? body.location, 'Location', 255, true);
    if (!address && latitude === null) throw new ApiError('Provide a location or coordinates.');
    const photoPath = requiredText(body.photo_url, 'Photo path', 500, true);
    if (
      photoPath
      && (!PHOTO_PATH_PATTERN.test(photoPath) || !photoPath.startsWith(`${actor.authId}/`))
    ) {
      throw new ApiError('The uploaded photo is invalid.', 403);
    }
    if (photoPath) await assertPhotoObjectExists(photoPath);
    const description = requiredText(body.description, 'Description', 5000, true);
    const reportId = await rpc<number>('submit_emergency_report', {
      p_reporter_id: actor.profile.id,
      p_emergency_type: emergencyType,
      p_severity: severity,
      p_description: description,
      p_latitude: latitude,
      p_longitude: longitude,
      p_address_text: address,
      p_photo_url: photoPath,
    });
    return { value: await currentReport(actor, Number(reportId)), status: 201 };
  }
  if (action === 'report-status' && method === 'PATCH') {
    const reportId = id();
    const body = await readJsonBody(request);
    const status = validEnum(body.status, STATUSES, 'status');
    const notes = requiredText(body.notes, 'Notes', 2000, true);
    const afterActionReport = requiredText(body.after_action_report, 'After-action report', 5000, true);
    await rpc<number>('transition_emergency_report', {
      p_report_id: reportId,
      p_actor_id: actor.profile.id,
      p_status: status,
      p_notes: notes,
      p_after_action_report: afterActionReport,
    });
    return { value: await currentReport(actor, reportId) };
  }
  if (action === 'report-assignments' && method === 'GET') {
    requireRole(actor, STAFF);
    return { value: await getAssignments(id()) };
  }
  if (action === 'report-assignments' && method === 'POST') {
    requireRole(actor, SUPERVISORS);
    const body = await readJsonBody(request);
    await rpc<number>('assign_emergency_report', {
      p_report_id: id(),
      p_responder_id: validId(body.responder_id, 'responder ID'),
      p_actor_id: actor.profile.id,
      p_notes: requiredText(body.notes, 'Notes', 2000, true),
    });
    return { value: { assigned: true }, status: 201 };
  }
  if (action === 'report-status-history' && method === 'GET') {
    requireRole(actor, STAFF);
    return { value: await getStatusHistory(id()) };
  }
  if (action === 'locations' && method === 'POST') {
    const body = await readJsonBody(request);
    const latitude = finiteNumber(body.latitude, -90, 90, 'Latitude')!;
    const longitude = finiteNumber(body.longitude, -180, 180, 'Longitude')!;
    const reportId = body.report_id === null || body.report_id === undefined ? null : validId(body.report_id, 'report ID');
    if (reportId !== null) {
      const report = await one<JsonRecord>('emergency_reports', { select: 'reporter_id', id: `eq.${reportId}` });
      if (!report) throw new ApiError('Report not found.', 404);
      if (actor.profile.role === 'resident' && Number(report.reporter_id) !== actor.profile.id) {
        throw new ApiError('You are not authorized to update this report location.', 403);
      }
    }
    await insert('location_updates', {
      user_id: actor.profile.id,
      latitude,
      longitude,
      report_id: reportId,
    });
    return { value: { saved: true }, status: 201 };
  }
  if (action === 'locations' && method === 'GET') {
    requireRole(actor, STAFF);
    const latest = await rows<JsonRecord>('location_updates', {
      select: '*',
      order: 'created_at.desc,id.desc',
      limit: '1000',
    });
    const byUser = new Map<number, JsonRecord>();
    latest.forEach(location => {
      const userId = Number(location.user_id);
      if (!byUser.has(userId)) byUser.set(userId, location);
    });
    return { value: [...byUser.values()] };
  }
  if (action === 'safe-routes' && method === 'GET') {
    const routes = await rows<JsonRecord>('safe_routes', {
      select: '*',
      is_active: 'eq.true',
      order: 'created_at.desc',
      limit: '100',
    });
    const reportIds = [...new Set(routes.map(route => Number(route.report_id)).filter(Number.isSafeInteger))];
    const reports = reportIds.length
      ? await rows<JsonRecord>('emergency_reports', {
        select: 'id,status',
        id: `in.(${reportIds.join(',')})`,
        status: 'in.(open,in_progress)',
      })
      : [];
    const activeReportIds = new Set(reports.map(report => Number(report.id)));
    return {
      value: routes.filter(route => route.report_id !== null && activeReportIds.has(Number(route.report_id)))
        .map(route => {
          const { path_json: path, ...rest } = route;
          return { ...rest, path };
        }),
    };
  }
  if (action === 'safe-routes' && method === 'POST') {
    requireRole(actor, SUPERVISORS);
    const body = await readJsonBody(request);
    const path = body.path;
    if (!Array.isArray(path) || path.length < 2 || path.length > 100) {
      throw new ApiError('A route must contain between 2 and 100 map points.');
    }
    const cleanPath = path.map(point => {
      if (typeof point !== 'object' || point === null) throw new ApiError('Each route point must include valid coordinates.');
      const coords = point as JsonRecord;
      return {
        latitude: finiteNumber(coords.latitude, -90, 90, 'Latitude'),
        longitude: finiteNumber(coords.longitude, -180, 180, 'Longitude'),
      };
    });
    const result = await rpc<JsonRecord[]>('publish_safe_route', {
      p_report_id: validId(body.report_id, 'report ID'),
      p_actor_id: actor.profile.id,
      p_title: requiredText(body.title, 'Route name', 160),
      p_path: cleanPath,
    });
    const route = result[0];
    if (!route) throw new Error('Supabase did not return the published route.');
    const { path_json: savedPath, ...rest } = route;
    return { value: { ...rest, path: savedPath }, status: 201 };
  }
  if (action === 'evacuation-centers' && method === 'GET') {
    return { value: await rows('evacuation_centers', { select: '*', order: 'name.asc' }) };
  }
  if (action === 'evacuation-centers' && ['POST', 'PATCH'].includes(method)) {
    requireRole(actor, SUPERVISORS);
    const body = await readJsonBody(request);
    if (method === 'PATCH') {
      const centerId = validId(url.searchParams.get('id') ?? body.id, 'evacuation center ID');
      const fields: JsonRecord = {};
      for (const [key, max] of Object.entries({
        name: 160, address: 255, contact_person: 120, contact_number: 40, notes: 5000,
      })) {
        if (body[key] !== undefined) fields[key] = requiredText(body[key], key, max, key !== 'name' && key !== 'address');
      }
      for (const [key, min, max] of [['latitude', -90, 90], ['longitude', -180, 180]] as const) {
        if (body[key] !== undefined) fields[key] = finiteNumber(body[key], min, max, key);
      }
      for (const key of ['capacity', 'current_occupancy']) {
        if (body[key] !== undefined) {
          const value = finiteNumber(body[key], 0, 1_000_000, key);
          if (!Number.isInteger(value)) throw new ApiError(`${key} must be a whole number.`);
          fields[key] = value;
        }
      }
      if (body.status !== undefined) fields.status = validEnum(body.status, ['active', 'inactive'], 'status');
      if (!Object.keys(fields).length) throw new ApiError('No evacuation center fields were provided.');
      const changed = await update<JsonRecord>('evacuation_centers', { id: `eq.${centerId}` }, fields);
      if (!changed[0]) throw new ApiError('Evacuation center not found.', 404);
      await audit(actor.profile.id, 'evacuation_center_updated', 'evacuation_centers', centerId);
      return { value: changed[0] };
    }
    const capacity = finiteNumber(body.capacity ?? 0, 0, 1_000_000, 'Capacity');
    const occupancy = finiteNumber(body.current_occupancy ?? 0, 0, 1_000_000, 'Occupancy');
    if (!Number.isInteger(capacity) || !Number.isInteger(occupancy)) {
      throw new ApiError('Capacity and occupancy must be whole numbers.');
    }
    const created = await insert<JsonRecord>('evacuation_centers', {
      name: requiredText(body.name, 'Name', 160),
      address: requiredText(body.address, 'Address', 255),
      latitude: finiteNumber(body.latitude, -90, 90, 'Latitude'),
      longitude: finiteNumber(body.longitude, -180, 180, 'Longitude'),
      capacity,
      current_occupancy: occupancy,
      status: validEnum(body.status ?? 'active', ['active', 'inactive'], 'status'),
      contact_person: requiredText(body.contact_person, 'Contact person', 120, true),
      contact_number: requiredText(body.contact_number, 'Contact number', 40, true),
      notes: requiredText(body.notes, 'Notes', 5000, true),
      created_by: actor.profile.id,
    });
    await audit(actor.profile.id, 'evacuation_center_created', 'evacuation_centers', Number(created.id));
    return { value: created, status: 201 };
  }
  if (action === 'iot-devices' && method === 'GET') {
    requireRole(actor, STAFF);
    return {
      value: await rows('iot_devices', {
        select: 'id,device_code,name,latitude,longitude,sensor_type,alert_threshold,alert_unit,status,last_reading,last_reading_at,created_at,updated_at',
        order: 'name.asc',
      }),
    };
  }
  if (action === 'iot-devices' && method === 'POST') {
    return { value: await saveDevice(request, actor, false, url), status: 201 };
  }
  if (action === 'iot-devices' && method === 'PATCH') {
    return { value: await saveDevice(request, actor, true, url) };
  }
  if (action === 'sensors' && method === 'POST') {
    return { value: await saveDevice(request, actor, false, url), status: 201 };
  }
  if (action === 'sensor-readings' && method === 'GET') {
    requireRole(actor, STAFF);
    const deviceId = validId(url.searchParams.get('device_id'), 'device ID');
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') ?? 50) || 50));
    return {
      value: await rows('sensor_readings', {
        select: '*',
        device_id: `eq.${deviceId}`,
        order: 'recorded_at.desc,id.desc',
        limit: String(limit),
      }),
    };
  }
  if (action === 'notifications' && method === 'GET') {
    const { size, offset } = readPageParams(url);
    const [specific, general] = await Promise.all([
      rows<JsonRecord>('notifications', {
        select: '*', target_user_id: `eq.${actor.profile.id}`, order: 'created_at.desc',
        limit: String(size), offset: String(offset),
      }),
      rows<JsonRecord>('notifications', {
        select: '*', target_user_id: 'is.null', order: 'created_at.desc',
        limit: String(size), offset: String(offset),
      }),
    ]);
    const visible = [...specific, ...general]
      .filter(notification => notification.target_role === null || notification.target_role === actor.profile.role)
      .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
      .slice(0, size);
    const ids = visible.map(notification => Number(notification.id));
    const reads = ids.length
      ? await rows<JsonRecord>('notification_reads', {
        select: 'notification_id',
        user_id: `eq.${actor.profile.id}`,
        notification_id: `in.(${ids.join(',')})`,
      })
      : [];
    const readIds = new Set(reads.map(read => Number(read.notification_id)));
    const result = visible.map(notification => ({ ...notification, is_read: readIds.has(Number(notification.id)) }));
    for (const notification of visible) {
      if (!readIds.has(Number(notification.id))) {
        await supabaseRequest('rest/v1/notification_reads', {
          method: 'POST',
          query: { on_conflict: 'notification_id,user_id' },
          body: { notification_id: notification.id, user_id: actor.profile.id },
          prefer: 'resolution=ignore-duplicates,return=minimal',
        });
      }
    }
    return { value: result };
  }
  if (action === 'notification-read' && method === 'POST') {
    const body = await readJsonBody(request);
    const notificationId = validId(body.notification_id, 'notification ID');
    const notification = await one<JsonRecord>('notifications', { select: '*', id: `eq.${notificationId}` });
    if (
      !notification
      || (notification.target_user_id !== null && Number(notification.target_user_id) !== actor.profile.id)
      || (notification.target_role !== null && notification.target_role !== actor.profile.role)
    ) {
      throw new ApiError('Notification not found.', 404);
    }
    await supabaseRequest('rest/v1/notification_reads', {
      method: 'POST',
      query: { on_conflict: 'notification_id,user_id' },
      body: { notification_id: notificationId, user_id: actor.profile.id },
      prefer: 'resolution=ignore-duplicates,return=minimal',
    });
    return { value: { read: true } };
  }
  if (action === 'notifications' && method === 'POST') {
    requireRole(actor, SUPERVISORS);
    const body = await readJsonBody(request);
    const title = requiredText(body.title, 'Title', 180)!;
    const message = requiredText(body.body, 'Message', 10_000)!;
    const channel = validEnum(body.channel ?? 'in_app', ['in_app', 'push', 'sms', 'email'], 'channel');
    const targetRole = body.target_role === null || body.target_role === '' || body.target_role === undefined
      ? null
      : validRole(body.target_role);
    const targetUserId = body.target_user_id === null || body.target_user_id === '' || body.target_user_id === undefined
      ? null
      : validId(body.target_user_id, 'recipient ID');
    if (targetRole && targetUserId) throw new ApiError('Choose a user or a role as the recipient, not both.');
    if (targetUserId && !await one('profiles', { select: 'id', id: `eq.${targetUserId}` })) {
      throw new ApiError('Recipient account not found.');
    }
    const sent = channel === 'in_app';
    const notification = await insert<JsonRecord>('notifications', {
      title,
      body: message,
      channel,
      status: sent ? 'sent' : 'failed',
      target_role: targetRole,
      target_user_id: targetUserId,
      sent_by: actor.profile.id,
      error_message: sent ? null : `No ${channel.toUpperCase()} delivery provider is configured.`,
      sent_at: sent ? new Date().toISOString() : null,
    });
    await audit(actor.profile.id, 'notification_dispatched', 'notifications', Number(notification.id), {
      channel, status: notification.status,
    });
    return { value: notification, status: 201 };
  }
  if (action === 'caller-logs' && method === 'GET') {
    requireRole(actor, STAFF);
    const { size, offset } = readPageParams(url);
    const logs = await rows<JsonRecord>('caller_logs', {
      select: '*',
      order: 'created_at.desc',
      limit: String(size),
      offset: String(offset),
    });
    const profiles = await profilesById(logs.map(log => Number(log.logged_by)));
    return {
      value: logs.map(log => ({
        ...log,
        profiles: profiles.get(Number(log.logged_by))
          ? { full_name: profiles.get(Number(log.logged_by))?.full_name }
          : null,
      })),
    };
  }
  if (action === 'caller-logs' && method === 'POST') {
    requireRole(actor, STAFF);
    const body = await readJsonBody(request);
    const latitude = finiteNumber(body.latitude, -90, 90, 'Latitude', true);
    const longitude = finiteNumber(body.longitude, -180, 180, 'Longitude', true);
    if ((latitude === null) !== (longitude === null)) throw new ApiError('Provide both coordinates, or leave both empty.');
    const created = await insert<JsonRecord>('caller_logs', {
      caller_name: requiredText(body.caller_name, 'Caller name', 120, true),
      caller_phone: requiredText(body.caller_phone, 'Caller phone', 40),
      emergency_type: validEnum(body.emergency_type ?? 'other', EMERGENCY_TYPES, 'emergency type'),
      reported_location: requiredText(body.reported_location, 'Location', 255, true),
      latitude,
      longitude,
      description: requiredText(body.description, 'Description', 5000, true),
      logged_by: actor.profile.id,
      report_id: body.report_id === null || body.report_id === undefined ? null : validId(body.report_id, 'report ID'),
    });
    await audit(actor.profile.id, 'caller_log_created', 'caller_logs', Number(created.id));
    return { value: { id: created.id }, status: 201 };
  }
  if (action === 'audit-logs' && method === 'GET') {
    requireRole(actor, ['admin']);
    const { size, offset } = readPageParams(url);
    const logs = await rows<JsonRecord>('audit_logs', {
      select: '*',
      order: 'created_at.desc',
      limit: String(size),
      offset: String(offset),
    });
    const profiles = await profilesById(logs.flatMap(log => log.user_id === null ? [] : [Number(log.user_id)]));
    return {
      value: logs.map(log => ({
        ...log,
        profiles: profiles.get(Number(log.user_id))
          ? { full_name: profiles.get(Number(log.user_id))?.full_name, email: profiles.get(Number(log.user_id))?.email }
          : null,
      })),
    };
  }
  if (action === 'system-config' && method === 'GET') {
    requireRole(actor, ['admin']);
    const config = await rows<JsonRecord>('system_config', {
      select: 'key,value,description,updated_at',
      order: 'key.asc',
    });
    return {
      value: config.map(item => item.key === 'sms_api_key'
        ? {
          ...item,
          value: '',
          description: 'Secret values must be configured as Supabase Edge Function secrets, not in this table.',
        }
        : item),
    };
  }
  if (action === 'system-config' && method === 'PATCH') {
    requireRole(actor, ['admin']);
    const key = requiredText(url.searchParams.get('key'), 'Configuration key', 120)!;
    if (key === 'sms_api_key') {
      throw new ApiError('Configure provider credentials as Supabase Edge Function secrets; they cannot be stored here.');
    }
    const body = await readJsonBody(request);
    const value = requiredText(body.value, 'Value', 10_000, true) ?? '';
    const changed = await update<JsonRecord>('system_config', { key: `eq.${key}` }, {
      value,
      updated_by: actor.profile.id,
    });
    if (!changed[0]) throw new ApiError('Configuration key not found.', 404);
    await audit(actor.profile.id, 'system_config_updated', 'system_config', null, { key });
    return { value: { updated: true } };
  }
  if (action === 'analytics' && method === 'GET') {
    requireRole(actor, ['admin']);
    const [reports, profiles, readings] = await Promise.all([
      rows('emergency_reports', {
        select: 'status,emergency_type,severity,created_at', order: 'created_at.desc', limit: '5000',
      }),
      rows('profiles', { select: 'role,is_active,created_at', order: 'created_at.desc', limit: '5000' }),
      rows('sensor_readings', { select: 'is_alert,recorded_at', order: 'recorded_at.desc', limit: '200' }),
    ]);
    return { value: { reports, profiles, readings } };
  }
  if (action === 'operations-summary' && method === 'GET') {
    requireRole(actor, STAFF);
    const [open, inProgress, resolved, total, recent] = await Promise.all([
      count('emergency_reports', { status: 'eq.open' }),
      count('emergency_reports', { status: 'eq.in_progress' }),
      count('emergency_reports', { status: 'eq.resolved' }),
      count('emergency_reports'),
      rows<JsonRecord>('emergency_reports', {
        select: '*', order: 'created_at.desc', limit: '5',
      }),
    ]);
    return {
      value: {
        reports: await attachReportProfiles(recent),
        counts: { open, in_progress: inProgress, resolved, total },
      },
    };
  }
  if (action === 'dashboard' && method === 'GET') {
    requireRole(actor, STAFF);
    const [active, floodSensors, responders, totalReports, reportRows, mapReports, devices] = await Promise.all([
      count('emergency_reports', { status: 'in.(open,in_progress)' }),
      count('iot_devices', { sensor_type: 'eq.water_level', status: 'eq.active' }),
      count('profiles', { is_active: 'eq.true', role: 'in.(ldrrmo_staff,supervisor,admin)' }),
      count('emergency_reports'),
      rows<JsonRecord>('emergency_reports', { select: '*', order: 'created_at.desc', limit: '6' }),
      rows<JsonRecord>('emergency_reports', {
        select: 'id,emergency_type,severity,status,description,address_text,latitude,longitude,created_at',
        latitude: 'not.is.null', longitude: 'not.is.null', order: 'created_at.desc,id.desc', limit: '200',
      }),
      rows('iot_devices', {
        select: 'id,device_code,name,sensor_type,alert_unit,latitude,longitude,alert_threshold,status,last_reading,last_reading_at',
        order: 'created_at.desc',
      }),
    ]);
    const reports = await attachReportProfiles(reportRows);
    return {
      value: {
        stats: { active_incidents: active, flood_sensors: floodSensors, total_responders: responders, total_reports: totalReports },
        reports: reports.map(report => ({
          id: report.id, emergency_type: report.emergency_type, severity: report.severity, status: report.status,
          description: report.description, location: report.address_text, latitude: report.latitude,
          longitude: report.longitude, created_at: report.created_at,
          reporter_name: typeof report.profiles === 'object' && report.profiles !== null
            ? (report.profiles as JsonRecord).full_name
            : null,
        })),
        map_reports: mapReports,
        sensors: devices.map(device => ({
          ...device,
          unit: device.alert_unit,
          is_alert: device.last_reading !== null && Number(device.last_reading) >= Number(device.alert_threshold),
        })),
      },
    };
  }
  if (action === 'report-media' && method === 'GET') {
    const path = requiredText(url.searchParams.get('path'), 'Media path', 500)!;
    const report = await one<JsonRecord>('emergency_reports', {
      select: 'id,reporter_id,photo_url',
      photo_url: `eq.${path}`,
    });
    if (!report || (actor.profile.role === 'resident' && Number(report.reporter_id) !== actor.profile.id)) {
      throw new ApiError('File not found.', 404);
    }
    const signed = await signedPhotoUrl(path);
    if (!signed) throw new ApiError('File not found.', 404);
    return { value: { url: signed } };
  }

  throw new ApiError('Unknown API action.', 404);
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  const url = new URL(request.url);
  const action = url.searchParams.get('action') ?? '';
  if (action === 'health' && request.method === 'GET') return jsonResponse({ status: 'ok' });

  try {
    if (action === 'device-reading' && request.method === 'POST') {
      return jsonResponse(await ingestReading(request), 201);
    }
    const actor = await authenticate(request);
    const result = await dispatch(request, url, actor);
    return jsonResponse(result.value, result.status);
  } catch (error) {
    return errorResponse(error);
  }
});
