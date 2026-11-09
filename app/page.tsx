import { ActiveJobBanner } from "./components/feedback/active-job-banner";
import { NewRunForm } from "./components/feedback/new-run-form";
import { PageHeader } from "./components/page-header";
import { loadOntology } from "./server/jobs/ontology-source";
import { countOntologyQuestions } from "./server/rag/hierarchy/hierarchy-helper";

export default function Home() {
  const ontology = loadOntology();

  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="M4I" title="Start a run">
        Upload your documents, then ask your own question or run the whole
        ontology. When it finishes, accept or reject each answer and mark which
        chunks were relevant.
      </PageHeader>
      <ActiveJobBanner />
      <NewRunForm
        ontologyQuestions={countOntologyQuestions(ontology)}
        ontologyCategories={ontology.dimensions.reduce(
          (total, dimension) => total + dimension.categories.length,
          0,
        )}
      />
    </div>
  );
}
