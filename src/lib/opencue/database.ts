import { Pool } from 'pg';

// OpenCue database connection settings
// These should match the cuebot configuration
const pool = new Pool({
  host: process.env.OPENCUE_DB_HOST || 'localhost',
  port: parseInt(process.env.OPENCUE_DB_PORT || '5432'),
  database: process.env.OPENCUE_DB_NAME || 'cuebot_local',
  user: process.env.OPENCUE_DB_USER || 'cuebot',
  password: process.env.OPENCUE_DB_PASSWORD || '',
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export interface ShowJobHistoryStats {
  jobCount: number;
  subscriptionCount: number;
}

/**
 * Get job history stats for a show
 */
export async function getShowJobHistoryStats(showId: string): Promise<ShowJobHistoryStats> {
  const client = await pool.connect();
  try {
    const jobResult = await client.query(
      'SELECT COUNT(*) as count FROM job_history WHERE pk_show = $1',
      [showId]
    );
    const subResult = await client.query(
      'SELECT COUNT(*) as count FROM subscription WHERE pk_show = $1',
      [showId]
    );
    return {
      jobCount: parseInt(jobResult.rows[0]?.count || '0'),
      subscriptionCount: parseInt(subResult.rows[0]?.count || '0'),
    };
  } finally {
    client.release();
  }
}

/**
 * Force delete a show by clearing all dependencies first.
 * This removes ALL data associated with the show including jobs, layers, frames, history, etc.
 * WARNING: This permanently deletes all data for the show.
 */
export async function forceDeleteShow(showId: string): Promise<{ 
  success: boolean; 
  deletedJobs: number;
  deletedSubscriptions: number;
  error?: string;
}> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get all job IDs for this show
    const jobsResult = await client.query(
      'SELECT pk_job FROM job WHERE pk_show = $1',
      [showId]
    );
    const jobIds = jobsResult.rows.map(r => r.pk_job);

    // Get all layer IDs for jobs in this show
    let layerIds: string[] = [];
    if (jobIds.length > 0) {
      const layersResult = await client.query(
        'SELECT pk_layer FROM layer WHERE pk_job = ANY($1)',
        [jobIds]
      );
      layerIds = layersResult.rows.map(r => r.pk_layer);
    }

    // Delete layer_history and frame_history first (to avoid trigger issues)
    if (jobIds.length > 0) {
      await client.query('DELETE FROM layer_history WHERE pk_job = ANY($1)', [jobIds]);
      await client.query('DELETE FROM frame_history WHERE pk_job = ANY($1)', [jobIds]);
    }

    // Delete layer-related data
    if (layerIds.length > 0) {
      await client.query('DELETE FROM layer_stat WHERE pk_layer = ANY($1)', [layerIds]);
      await client.query('DELETE FROM layer_env WHERE pk_layer = ANY($1)', [layerIds]);
      await client.query('DELETE FROM layer_limit WHERE pk_layer = ANY($1)', [layerIds]);
      await client.query('DELETE FROM layer_output WHERE pk_layer = ANY($1)', [layerIds]);
      await client.query('DELETE FROM layer_resource WHERE pk_layer = ANY($1)', [layerIds]);
      await client.query('DELETE FROM layer_usage WHERE pk_layer = ANY($1)', [layerIds]);
      await client.query('DELETE FROM layer_mem WHERE pk_layer = ANY($1)', [layerIds]);
      await client.query('DELETE FROM frame WHERE pk_layer = ANY($1)', [layerIds]);
      await client.query('DELETE FROM layer WHERE pk_layer = ANY($1)', [layerIds]);
    }

    // Delete job-related data
    if (jobIds.length > 0) {
      await client.query('DELETE FROM job_stat WHERE pk_job = ANY($1)', [jobIds]);
      await client.query('DELETE FROM job_env WHERE pk_job = ANY($1)', [jobIds]);
      await client.query('DELETE FROM job_resource WHERE pk_job = ANY($1)', [jobIds]);
      await client.query('DELETE FROM job_usage WHERE pk_job = ANY($1)', [jobIds]);
      await client.query('DELETE FROM job_mem WHERE pk_job = ANY($1)', [jobIds]);
      await client.query('DELETE FROM job_post WHERE pk_job = ANY($1)', [jobIds]);
      await client.query('DELETE FROM depend WHERE pk_job_depend_on = ANY($1) OR pk_job_depend_er = ANY($1)', [jobIds]);
      await client.query('DELETE FROM job WHERE pk_job = ANY($1)', [jobIds]);
    }

    // Delete job_history
    const jobHistoryResult = await client.query(
      'DELETE FROM job_history WHERE pk_show = $1',
      [showId]
    );
    const deletedJobs = (jobHistoryResult.rowCount || 0) + jobIds.length;

    // Delete show-level dependencies
    await client.query('DELETE FROM folder WHERE pk_show = $1', [showId]);
    await client.query('DELETE FROM filter WHERE pk_show = $1', [showId]);
    await client.query('DELETE FROM point WHERE pk_show = $1', [showId]);
    await client.query('DELETE FROM owner WHERE pk_show = $1', [showId]);
    await client.query('DELETE FROM show_service WHERE pk_show = $1', [showId]);
    await client.query('DELETE FROM show_alias WHERE pk_show = $1', [showId]);

    // Delete subscriptions
    const subResult = await client.query(
      'DELETE FROM subscription WHERE pk_show = $1',
      [showId]
    );
    const deletedSubscriptions = subResult.rowCount || 0;

    // Delete show metadata
    await client.query('DELETE FROM show_metadata WHERE pk_show = $1', [showId]);

    // Delete the show itself
    const showResult = await client.query(
      'DELETE FROM show WHERE pk_show = $1',
      [showId]
    );

    if (showResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return {
        success: false,
        deletedJobs: 0,
        deletedSubscriptions: 0,
        error: 'Show not found',
      };
    }

    await client.query('COMMIT');

    return {
      success: true,
      deletedJobs,
      deletedSubscriptions,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Force delete show failed:', error);
    return {
      success: false,
      deletedJobs: 0,
      deletedSubscriptions: 0,
      error: message,
    };
  } finally {
    client.release();
  }
}

/**
 * Check if database connection is working
 */
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Show Metadata (semester, etc.)
// ============================================================================

/**
 * Get semester for a show
 */
export async function getShowSemester(showId: string): Promise<string | null> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT semester FROM show_metadata WHERE pk_show = $1',
      [showId]
    );
    return result.rows[0]?.semester || null;
  } finally {
    client.release();
  }
}

/**
 * Set semester for a show (upsert)
 */
export async function setShowSemester(showId: string, semester: string | null): Promise<void> {
  const client = await pool.connect();
  try {
    if (semester) {
      await client.query(
        `INSERT INTO show_metadata (pk_show, semester) VALUES ($1, $2)
         ON CONFLICT (pk_show) DO UPDATE SET semester = $2`,
        [showId, semester.toUpperCase()]
      );
    } else {
      await client.query(
        'DELETE FROM show_metadata WHERE pk_show = $1',
        [showId]
      );
    }
  } finally {
    client.release();
  }
}

/**
 * Get all show metadata (semester mapping)
 */
export async function getAllShowMetadata(): Promise<Map<string, { semester: string | null }>> {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT pk_show, semester FROM show_metadata');
    const map = new Map<string, { semester: string | null }>();
    for (const row of result.rows) {
      map.set(row.pk_show, { semester: row.semester });
    }
    return map;
  } finally {
    client.release();
  }
}

// ============================================================================
// Show Operations (not available in OpenCue API)
// ============================================================================

/**
 * Rename a show (OpenCue doesn't have a rename API, so we update directly)
 */
export async function renameShow(showId: string, newName: string): Promise<{ success: boolean; error?: string }> {
  const client = await pool.connect();
  try {
    // Check if name already exists
    const existingResult = await client.query(
      'SELECT pk_show FROM show WHERE str_name = $1 AND pk_show != $2',
      [newName, showId]
    );
    if (existingResult.rows.length > 0) {
      return { success: false, error: 'A show with this name already exists' };
    }

    // Update the show name
    const result = await client.query(
      'UPDATE show SET str_name = $1 WHERE pk_show = $2',
      [newName, showId]
    );

    if (result.rowCount === 0) {
      return { success: false, error: 'Show not found' };
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Rename show failed:', error);
    return { success: false, error: message };
  } finally {
    client.release();
  }
}

// ============================================================================
// Job History (archived jobs from job_history table)
// ============================================================================

export interface ArchivedJob {
  id: string;
  name: string;
  show: string;
  shot: string;
  user: string;
  totalFrames: number;
  succeededFrames: number;
  deadFrames: number;
  eatenFrames: number;
  waitingFrames: number;
  runningFrames: number;
  dependFrames: number;
  startTime: number;
  stopTime: number;
  maxRss: number;
}

/**
 * Get archived jobs from job_history table.
 * These are jobs that have completed and been moved out of the active job table.
 */
export async function getJobHistory(opts?: {
  show?: string;
  user?: string;
  limit?: number;
}): Promise<ArchivedJob[]> {
  const client = await pool.connect();
  try {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (opts?.show) {
      conditions.push(`s.str_name = $${paramIdx++}`);
      params.push(opts.show);
    }
    if (opts?.user) {
      conditions.push(`jh.str_user = $${paramIdx++}`);
      params.push(opts.user);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = opts?.limit || 1000;
    params.push(limit);

    const result = await client.query(
      `SELECT jh.pk_job, jh.str_name, COALESCE(s.str_name, 'unknown') as show_name,
              jh.str_shot, jh.str_user,
              jh.int_frame_count, jh.int_succeeded_count, jh.int_dead_count,
              jh.int_eaten_count, jh.int_waiting_count, jh.int_running_count,
              jh.int_depend_count, jh.int_ts_started, jh.int_ts_stopped,
              jh.int_max_rss
       FROM job_history jh
       LEFT JOIN show s ON s.pk_show = jh.pk_show
       ${where}
       ORDER BY jh.int_ts_stopped DESC
       LIMIT $${paramIdx}`,
      params
    );

    return result.rows.map(row => ({
      id: row.pk_job,
      name: row.str_name,
      show: row.show_name,
      shot: row.str_shot,
      user: row.str_user,
      totalFrames: Number.parseInt(row.int_frame_count, 10),
      succeededFrames: Number.parseInt(row.int_succeeded_count, 10),
      deadFrames: Number.parseInt(row.int_dead_count, 10),
      eatenFrames: Number.parseInt(row.int_eaten_count, 10),
      waitingFrames: Number.parseInt(row.int_waiting_count, 10),
      runningFrames: Number.parseInt(row.int_running_count, 10),
      dependFrames: Number.parseInt(row.int_depend_count, 10),
      startTime: row.int_ts_started,
      stopTime: row.int_ts_stopped,
      maxRss: Number.parseInt(row.int_max_rss, 10),
    }));
  } finally {
    client.release();
  }
}
