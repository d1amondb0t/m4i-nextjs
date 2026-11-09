import { redirect } from "next/navigation";

import { JobProgress } from "@/app/components/feedback/job-progress";
import { currentUser } from "@/app/server/auth/session";

export default async function JobPage({ params }: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  if (!(await currentUser())) {
    redirect(`/login?next=/jobs/${encodeURIComponent(id)}`);
  }

  return (
    <div className="max-w-2xl">
      <JobProgress jobId={id} />
    </div>
  );
}
