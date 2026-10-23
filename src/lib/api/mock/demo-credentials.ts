// Demo only: the seeded accounts' password and the fixed two-factor code of the mock. Kept apart from the mock's
// barrel so the auth screens import these two strings alone (never the mock repositories) and show them only while
// the session repository is the mock (isMockRepository("session")).
export const DEMO_PASSWORD = "Demo1234!";
export const DEMO_TOTP_CODE = "123456";
