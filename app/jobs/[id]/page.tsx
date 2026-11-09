import { JobProgress } from "@/app/components/feedback/job-progress";

export default async function JobPage({ params }: PageProps<"/jobs/[id]">) {
  const { id } = await params;

  return (
    <div className="max-w-2xl">
      <JobProgress jobId={id} />
    </div>
  );
}
