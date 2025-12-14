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

// Job types
export interface Job {
  id: string;
  name: string;
  state: string;
  isPaused: boolean;
  user: string;
  show: string;
  priority: number;
  startTime: number;
  stopTime: number;
  pendingFrames: number;
  runningFrames: number;
  deadFrames: number;
  succeededFrames: number;
  totalFrames: number;
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
  cores: number;
  idleCores: number;
  memory: number;
  idleMemory: number;
  load: number;
  bootTime: number;
  pingTime: number;
}

export interface Show {
  id: string;
  name: string;
  active: boolean;
  defaultMinCores: number;
  defaultMaxCores: number;
}

// Job API
export async function getJobs(opts?: {
  show?: string;
  user?: string;
  includeFinished?: boolean;
}): Promise<{ jobs: { jobs: Job[] } | Job[] }> {
  const request: Record<string, unknown> = {};

  if (opts?.show || opts?.user) {
    request.r = {};
    if (opts.show) (request.r as Record<string, unknown>).show = [opts.show];
    if (opts.user) (request.r as Record<string, unknown>).user = [opts.user];
  }

  if (opts?.includeFinished) {
    request.include_finished = true;
  }

  return gatewayCall('job.JobInterface', 'GetJobs', request);
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

export async function lockHost(hostId: string): Promise<void> {
  await gatewayCall('host.HostInterface', 'Lock', { host: { id: hostId } });
}

export async function unlockHost(hostId: string): Promise<void> {
  await gatewayCall('host.HostInterface', 'Unlock', { host: { id: hostId } });
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
