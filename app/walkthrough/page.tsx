import { SiteHeader } from "@/components/site-header";

const caseId = "10000000-0000-4000-8000-000000000006";
const floorId = "10000000-0000-4000-8000-000000000007";

export default function WalkthroughPage() {
  return <main className="page-shell"><SiteHeader title="TEST_ONLY Founder walkthrough" subtitle="Disposable local fixture" minimal /><section className="workspace-state"><h1>Founder complete-flow snapshot</h1><p>All content is synthetic. Steps 13 and 17 remain intentionally blocked; report steps preserve their protected workflow gates.</p><ol>{Array.from({ length: 17 }, (_, index) => <li key={index}><a className="text-link" href={`/founder/${String(index + 1).padStart(2, "0")}?caseId=${caseId}&floorId=${floorId}&walkthrough=TEST_ONLY`}>Open Step {String(index + 1).padStart(2, "0")}</a></li>)}</ol></section></main>;
}
