import { redirect } from "next/navigation";

import { ActiveJobBanner } from "./components/feedback/active-job-banner";
import { NewRunForm } from "./components/feedback/new-run-form";
import { PageHeader } from "./components/page-header";
import { currentUser } from "./server/auth/session";
import { loadOntology } from "./server/jobs/ontology-source";
import { ontologySize } from "./server/rag/hierarchy/hierarchy-helper";
import { loadIndicatorOntology } from "./server/rag/indicators/indicator-ontology-source";

export default async function Home() {
  if (!(await currentUser())) redirect("/login");

  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="M4I" title="Start a run">
        Upload your documents, then ask your own question, run the whole
        ontology, or find outcome indicators. When it finishes, accept or reject
        each answer and mark which chunks were relevant.
      </PageHeader>
      <ActiveJobBanner />
      <NewRunForm
        sizes={{
          ontology: ontologySize(loadOntology()),
          indicators: ontologySize(loadIndicatorOntology()),
        }}
      />
    </div>
  );
}
