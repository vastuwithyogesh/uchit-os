import { MediaLibraryConsole } from "@/components/media-library-console";
import { APPROVED_FOUNDER_ASSETS } from "@/lib/founder-media-manifest";

export default function MediaLibraryPage() {
  const assets = APPROVED_FOUNDER_ASSETS.map(({ clientSendable: _sendable, serviceApplicability: _scope, audience: _audience, statutoryPurpose: _purpose, ...safe }) => safe);
  return <main className="main"><MediaLibraryConsole assets={assets} /></main>;
}
