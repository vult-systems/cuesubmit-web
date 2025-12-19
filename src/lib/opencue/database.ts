import { Pool } from 'pg';

// OpenCue database connection settings
// These should match the cuebot configuration
const pool = new Pool({
  host: process.env.OPENCUE_DB_HOST || 'localhost',
  port: parseInt(process.env.OPENCUE_DB_PORT || '5432'),
  database: process.env.OPENCUE_DB_NAME || 'cuebot_local',
  user: process.env.OPENCUE_DB_USER || 'cuebot',
  password: process.env.OPENCUE_DB_PASSWORD || 'uiw3d',
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
 * This removes job_history, subscriptions, and the show itself.
 * WARNING: This permanently deletes all historical data for the show.
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

    // Delete job history (frame_history and layer_history cascade automatically)
    const jobResult = await client.query(
      'DELETE FROM job_history WHERE pk_show = $1',
      [showId]
    );
    const deletedJobs = jobResult.rowCount || 0;

    // Delete subscriptions
    const subResult = await client.query(
      'DELETE FROM subscription WHERE pk_show = $1',
      [showId]
    );
    const deletedSubscriptions = subResult.rowCount || 0;

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
