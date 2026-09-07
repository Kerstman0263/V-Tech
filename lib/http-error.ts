/**
 * Lichtgewicht fout met HTTP-status. Bewust in een eigen module zodat modules
 * die 'm gebruiken (bv. lib/permissions) niet de hele auth/db-keten hoeven te
 * importeren — dat houdt ze puur en unit-testbaar.
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
