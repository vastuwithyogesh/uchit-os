import { AppState, getAppState, setAppState } from "@/lib/store";
import { readOptInLeadRecords, writeOptInLeadRecords } from "@/lib/optin-leads-store";
import { readReviewCallBookingRecords, writeReviewCallBookingRecords } from "@/lib/review-call-bookings-store";
import { readAdvanceVerificationRecords, writeAdvanceVerificationRecords } from "@/lib/advance-verifications-store";

export async function loadStateFromPersistence(): Promise<AppState> {
  const state = getAppState();
  state.optInLeads = await readOptInLeadRecords();
  state.reviewCallBookings = await readReviewCallBookingRecords();
  state.advanceVerifications = await readAdvanceVerificationRecords();
  return state;
}

export async function persistStateToDatabase(state: AppState = getAppState()) {
  const nextState = structuredClone(state);
  setAppState(nextState);
  await Promise.all([
    writeOptInLeadRecords(nextState.optInLeads),
    writeReviewCallBookingRecords(nextState.reviewCallBookings),
    writeAdvanceVerificationRecords(nextState.advanceVerifications)
  ]);
  return nextState;
}
