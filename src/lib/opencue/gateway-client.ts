import { createJWTToken } from '../jwt';

const GATEWAY_URL = process.env.REST_GATEWAY_URL || 'http://localhost:8448';

export class GatewayError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: string
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

export async function gatewayCall<T>(
  interfaceName: string,
  method: string,
  body: object = {}
): Promise<T> {
  const token = createJWTToken('cuesubmit-server');

  const url = `${GATEWAY_URL}/${interfaceName}/${method}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new GatewayError(
        `Gateway error: ${response.status} ${response.statusText}`,
        response.status,
        text
      );
    }

    return response.json();
  } catch (error) {
    if (error instanceof GatewayError) {
      throw error;
    }
    throw new GatewayError(
      `Failed to connect to REST Gateway: ${error instanceof Error ? error.message : 'Unknown error'}`,
      0
    );
  }
}

// Job stats from OpenCue (nested in jobStats)
export interface JobStats {
  totalLayers: number;
  totalFrames: number;
  waitingFrames: number;
  runningFrames: number;
  deadFrames: number;
  eatenFrames: number;
  dependFrames: number;
  succeededFrames: number;
  pendingFrames: number;
  avgFrameSec: number;
  highFrameSec: number;
  avgCoreSec: number;
  renderedFrameCount: string;
  failedFrameCount: string;
  remainingCoreSec: string;
  totalCoreSec: string;
  renderedCoreSec: string;
  failedCoreSec: string;
  maxRss: string;
  reservedCores: number;
}

// Raw job from OpenCue API
export interface RawJob {
  id: string;
  name: string;
  state: string;
  isPaused: boolean;
  user: string;
  show: string;
  shot?: string;
  group?: string;
  facility?: string;
  os?: string;
  priority: number;
  minCores?: number;
  maxCores?: number;
  minGpus?: number;
  maxGpus?: number;
  logDir?: string;
  hasComment?: boolean;
  autoEat?: boolean;
  startTime: number;
  stopTime: number;
  jobStats: JobStats;
}

// Normalized job interface for the UI
export interface Job {
  id: string;
  name: string;
  state: string;
  isPaused: boolean;
  user: string;
  show: string;
  shot?: string;
  group?: string;
  facility?: string;
  priority: number;
  logDir?: string;
  startTime: number;
  stopTime: number;
  pendingFrames: number;
  runningFrames: number;
  deadFrames: number;
  succeededFrames: number;
  eatenFrames: number;
  waitingFrames: number;
  dependFrames: number;
  totalFrames: number;
  // Extended stats
  avgFrameSec?: number;
  reservedCores?: number;
}

// Transform raw OpenCue job to normalized UI job
export function normalizeJob(raw: RawJob): Job {
  const stats = raw.jobStats || {};
  return {
    id: raw.id,
    name: raw.name,
    state: raw.state,
    isPaused: raw.isPaused,
    user: raw.user,
    show: raw.show,
    shot: raw.shot,
    group: raw.group,
    facility: raw.facility,
    priority: raw.priority,
    logDir: raw.logDir,
    startTime: raw.startTime,
    stopTime: raw.stopTime,
    pendingFrames: stats.pendingFrames || 0,
    runningFrames: stats.runningFrames || 0,
    deadFrames: stats.deadFrames || 0,
    succeededFrames: stats.succeededFrames || 0,
    eatenFrames: stats.eatenFrames || 0,
    waitingFrames: stats.waitingFrames || 0,
    dependFrames: stats.dependFrames || 0,
    totalFrames: stats.totalFrames || 0,
    avgFrameSec: stats.avgFrameSec,
    reservedCores: stats.reservedCores,
  };
}

export interface Frame {
  id: string;
  name: string;
  number: number;
  state: string;
  retryCount: number;
  exitStatus: number;
  lastResource: string;
  startTime: number;
  stopTime: number;
}

export interface Host {
  id: string;
  name: string;
  state: string;
  lockState: string;
  nimbyEnabled: boolean;
  nimbyLocked?: boolean;
  cores: number;
  idleCores: number;
  memory: number;
  idleMemory: number;
  swap: number;
  freeSwap: number;
  gpuMemory?: number;
  idleGpuMemory?: number;
  gpus?: number;
  idleGpus?: number;
  load: number;
  bootTime: number;
  pingTime: number;
  tags?: string[];
  alloc?: string;
  ipAddress?: string;
}

export interface Show {
  id: string;
  name: string;
  tag?: string;
  description?: string;
  active: boolean;
  defaultMinCores: number;
  defaultMaxCores: number;
  bookingEnabled?: boolean;
  semester?: string; // e.g., "F25", "S26"
}

export interface Subscription {
  id: string;
  name: string;
  showName: string;
  facility: string;
  allocationName: string;
  size: number;
  burst: number;
  reservedCores: number;
  reservedGpus: number;
}

// Job API
// Raw response type from OpenCue GetJobs API
interface GetJobsRawResponse {
  jobs: {
    jobs: RawJob[];
  };
}

export async function getJobs(opts?: {
  show?: string;
  user?: string;
  includeFinished?: boolean;
}): Promise<{ jobs: Job[] }> {
  const request: Record<string, unknown> = { r: {} };

  if (opts?.show) {
    (request.r as Record<string, unknown>).shows = [opts.show];
  }
  if (opts?.user) {
    (request.r as Record<string, unknown>).users = [opts.user];
  }
  if (opts?.includeFinished) {
    (request.r as Record<string, unknown>).include_finished = true;
  }

  const response = await gatewayCall<GetJobsRawResponse>('job.JobInterface', 'GetJobs', request);
  
  // Normalize raw jobs to UI jobs
  const rawJobs = response?.jobs?.jobs || [];
  const normalizedJobs = rawJobs.map(normalizeJob);
  
  return { jobs: normalizedJobs };
}

export async function getJob(jobId: string): Promise<{ job: Job }> {
  return gatewayCall('job.JobInterface', 'GetJob', { id: jobId });
}

export async function getFrames(
  jobId: string,
  opts?: { page?: number; limit?: number }
): Promise<{ frames: { frames: Frame[] } | Frame[] }> {
  return gatewayCall('job.JobInterface', 'GetFrames', {
    job: { id: jobId },
    req: {
      page: opts?.page || 1,
      limit: opts?.limit || 100,
      include_finished: true,
    },
  });
}

export async function killJob(jobId: string): Promise<void> {
  await gatewayCall('job.JobInterface', 'Kill', { job: { id: jobId } });
}

export async function pauseJob(jobId: string): Promise<void> {
  await gatewayCall('job.JobInterface', 'Pause', { job: { id: jobId } });
}

export async function resumeJob(jobId: string): Promise<void> {
  await gatewayCall('job.JobInterface', 'Resume', { job: { id: jobId } });
}

export async function retryFrames(
  jobId: string,
  frameIds?: string[]
): Promise<void> {
  const request: Record<string, unknown> = { job: { id: jobId } };
  if (frameIds) {
    request.req = { ids: frameIds };
  }
  await gatewayCall('job.JobInterface', 'RetryFrames', request);
}

export async function eatFrames(
  jobId: string,
  frameIds?: string[]
): Promise<void> {
  const request: Record<string, unknown> = { job: { id: jobId } };
  if (frameIds) {
    request.req = { ids: frameIds };
  }
  await gatewayCall('job.JobInterface', 'EatFrames', request);
}

// Job submission
export async function launchSpec(specXml: string): Promise<{ names: string[] }> {
  return gatewayCall('job.JobInterface', 'LaunchSpec', { spec: specXml });
}

// Host API
export async function getHosts(): Promise<{ hosts: { hosts: Host[] } | Host[] }> {
  return gatewayCall('host.HostInterface', 'GetHosts', {});
}

export async function getHost(hostId: string): Promise<{ host: Host }> {
  return gatewayCall('host.HostInterface', 'GetHost', { id: hostId });
}

// LockState enum: OPEN=0, LOCKED=1, NIMBY_LOCKED=2
export async function lockHost(hostId: string, hostName?: string): Promise<void> {
  // The Lock method tries to communicate with RQD, which fails if RQD isn't running
  // Try different approaches to find one that works
  const hostRef: { id?: string; name?: string } = { id: hostId };
  if (hostName) {
    hostRef.name = hostName;
  }
  await gatewayCall('host.HostInterface', 'Lock', { host: hostRef });
}

export async function unlockHost(hostId: string, hostName?: string): Promise<void> {
  // The Unlock method tries to communicate with RQD, which fails if RQD isn't running
  const hostRef: { id?: string; name?: string } = { id: hostId };
  if (hostName) {
    hostRef.name = hostName;
  }
  await gatewayCall('host.HostInterface', 'Unlock', { host: hostRef });
}

export async function rebootHost(hostId: string): Promise<void> {
  await gatewayCall('host.HostInterface', 'Reboot', { host: { id: hostId } });
}

export async function rebootWhenIdleHost(hostId: string): Promise<void> {
  await gatewayCall('host.HostInterface', 'RebootWhenIdle', { host: { id: hostId } });
}

export async function addHostTags(hostId: string, tags: string[]): Promise<void> {
  await gatewayCall('host.HostInterface', 'AddTags', { host: { id: hostId }, tags });
}

export async function removeHostTags(hostId: string, tags: string[]): Promise<void> {
  await gatewayCall('host.HostInterface', 'RemoveTags', { host: { id: hostId }, tags });
}

export async function setHostAllocation(hostId: string, allocationId: string): Promise<void> {
  await gatewayCall('host.HostInterface', 'SetAllocation', {
    host: { id: hostId },
    allocation_id: allocationId
  });
}

export async function setHostHardwareState(hostId: string, state: string): Promise<void> {
  await gatewayCall('host.HostInterface', 'SetHardwareState', {
    host: { id: hostId },
    state
  });
}

export async function setHostThreadMode(hostId: string, mode: string): Promise<void> {
  await gatewayCall('host.HostInterface', 'SetThreadMode', {
    host: { id: hostId },
    mode
  });
}

// Allocation API
export interface Allocation {
  id: string;
  name: string;
  tag: string;
  facility: string;
}

export async function getAllocations(): Promise<{ allocations: Allocation[] }> {
  return gatewayCall('facility.FacilityInterface', 'GetAllocations', {});
}

// Show API
export async function getShows(): Promise<{ shows: { shows: Show[] } | Show[] }> {
  return gatewayCall('show.ShowInterface', 'GetShows', {});
}

export async function getShow(showName: string): Promise<{ show: Show }> {
  return gatewayCall('show.ShowInterface', 'FindShow', { name: showName });
}

export async function getActiveShows(): Promise<{ shows: { shows: Show[] } | Show[] }> {
  return gatewayCall('show.ShowInterface', 'GetActiveShows', {});
}

export async function createShow(showName: string): Promise<{ show: Show }> {
  return gatewayCall('show.ShowInterface', 'CreateShow', { name: showName });
}

export async function setShowActive(showId: string, active: boolean): Promise<void> {
  await gatewayCall('show.ShowInterface', 'SetActive', {
    show: { id: showId },
    value: active
  });
}

export async function setShowDefaultMinCores(showId: string, minCores: number): Promise<void> {
  await gatewayCall('show.ShowInterface', 'SetDefaultMinCores', {
    show: { id: showId },
    min_cores: minCores
  });
}

export async function setShowDefaultMaxCores(showId: string, maxCores: number): Promise<void> {
  await gatewayCall('show.ShowInterface', 'SetDefaultMaxCores', {
    show: { id: showId },
    max_cores: maxCores
  });
}

export async function deleteShow(showId: string): Promise<void> {
  // Note: OpenCue only allows deletion of shows that have never had jobs launched
  await gatewayCall('show.ShowInterface', 'Delete', {
    show: { id: showId }
  });
}

export async function getShowSubscriptions(showId: string): Promise<{ subscriptions: { subscriptions: Subscription[] } | Subscription[] }> {
  return gatewayCall('show.ShowInterface', 'GetSubscriptions', {
    show: { id: showId }
  });
}

export async function deleteSubscription(subscriptionId: string): Promise<void> {
  await gatewayCall('subscription.SubscriptionInterface', 'Delete', {
    subscription: { id: subscriptionId }
  });
}
