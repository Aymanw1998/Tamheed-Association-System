import { JourneyProvider } from "../../journey/JourneyProvider";
import { TourProvider } from "../../tours/TourProvider";

// The system's guidance: the guided journey (its sign-in invitation and the
// guide character) and the help center around it (the "?" button, the
// new-access card, "what's new", the menu's "new" badges).
// Turned off for now by the owner (2026-11-01); set to true to bring it back.
// While off, useJourney()/useTour() answer their built-in "nothing" defaults.
export const GUIDANCE_ENABLED = false;

export default function GuidanceProviders({ enabled = GUIDANCE_ENABLED, children }) {
  if (!enabled) return children;
  // The journey wraps the help center: every «أرني» and «ابدأ» runs it.
  return (
    <JourneyProvider>
      <TourProvider>{children}</TourProvider>
    </JourneyProvider>
  );
}
