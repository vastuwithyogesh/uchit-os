import { BookingResponseClient } from "@/components/booking-response-client";
export default async function BookingResponsePage({params}:{params:Promise<{token:string}>}){return <BookingResponseClient token={(await params).token}/>}
