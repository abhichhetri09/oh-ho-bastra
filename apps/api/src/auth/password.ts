import bcrypt from "bcryptjs";

// Passwords are bcrypt hashes at Go's bcrypt.DefaultCost, in the "$2a$"
// form Go wrote, so hashes from either API verify in the other.

/** bcrypt.DefaultCost. */
export const BCRYPT_COST = 10;

/** bcrypt reads at most 72 bytes; Go refused longer passwords to hash. */
export const MAX_PASSWORD_BYTES = 72;

/**
 * Whether password is too long to hash (Go's bcrypt.ErrPasswordTooLong).
 * The max=72 rule counts characters; bcrypt's limit is 72 bytes.
 */
export const passwordTooLong = (password: string) =>
  Buffer.byteLength(password) > MAX_PASSWORD_BYTES;

/**
 * The hash of password (at most 72 bytes; check passwordTooLong first).
 * $2a$ and $2b$ only differ for passwords over 255 bytes, so the salt is
 * relabelled to the $2a$ Go wrote.
 */
export async function hashPassword(password: string): Promise<string> {
  if (passwordTooLong(password))
    throw new Error("bcrypt: password length exceeds 72 bytes");
  const salt = (await bcrypt.genSalt(BCRYPT_COST)).replace(/^\$2b\$/, "$2a$");
  return bcrypt.hash(password, salt);
}

/** Whether password matches hash; a malformed hash is a mismatch. */
export async function checkPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;

/**
 * Compared against when the email doesn't exist, so a login for an
 * unknown email takes as long as a wrong password and doesn't reveal
 * which emails are registered.
 */
export const dummyHash = () =>
  (dummy ??= hashPassword("dummy-password-for-timing"));
