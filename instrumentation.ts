export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Start jobs that were queued before the server restarted.
    const { jobWorker } = await import("./app/server/jobs/job-worker");
    void jobWorker().wake();
  }
}
