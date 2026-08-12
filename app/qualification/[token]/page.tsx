import { QualificationFormClient } from "@/components/qualification-form-client";
export default async function QualificationPage({ params }: { params: Promise<{ token: string }> }) { return <QualificationFormClient token={(await params).token} />; }
