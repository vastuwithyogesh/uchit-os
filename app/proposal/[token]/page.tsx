import { CommercialProposalClient } from "@/components/commercial-proposal-client";

export default async function CommercialProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <main className="public-proposal-page"><CommercialProposalClient token={token} /></main>;
}
