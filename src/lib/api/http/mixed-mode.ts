// Mixed mode: the session is real (HTTP) while other repositories are still the in-memory mock. The mock authorizes
// against its own current user, so it is kept pointing at the person who is really signed in (matched by email:
// ids differ between the mock seed and the API, the seeded emails are the same).
import type { SessionRepository } from "../repositories";
import { isSignedInUser, type SignInResult, type User } from "../types";

export interface MockUserControl {
  /** Makes the mock act as the user with that email. Returns false (and changes nothing) when it has none. */
  adopt: (email: string) => boolean;
  /** Back to the mock's default user. */
  reset: () => void;
}

/** Wraps the HTTP session so every successful sign-in, refresh or "Ver como" switch is mirrored on the mock. */
export function withMockUserSync(
  session: SessionRepository,
  mock: MockUserControl,
): SessionRepository {
  const mirror = async <T extends SignInResult>(pending: Promise<T>): Promise<T> => {
    const result = await pending;
    // A two-factor step (202) started no session: nobody to adopt yet.
    if (isSignedInUser(result)) mock.adopt((result as User).email);
    return result;
  };
  const afterSignOut = async (pending: Promise<void>) => {
    await pending;
    mock.reset();
  };

  return {
    ...session,
    getCurrentUser: () => mirror(session.getCurrentUser()),
    login: (input) => mirror(session.login(input)),
    acceptInvitation: (input) => mirror(session.acceptInvitation(input)),
    exchangeMagicLink: (token) => mirror(session.exchangeMagicLink(token)),
    exchangeEntryLink: (token) => mirror(session.exchangeEntryLink(token)),
    verifyTwoFactor: (input) => mirror(session.verifyTwoFactor(input)),
    recoverTwoFactor: (input) => mirror(session.recoverTwoFactor(input)),
    setViewAs: (userId) => mirror(session.setViewAs(userId)),
    logout: () => afterSignOut(session.logout()),
    logoutAll: () => afterSignOut(session.logoutAll()),
  };
}
