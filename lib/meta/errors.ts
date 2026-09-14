export class MetaApiError extends Error {
  readonly safeCode: string;
  readonly status: number | null;

  constructor(safeCode: string, status: number | null = null) {
    super("Meta request failed");
    this.name = "MetaApiError";
    this.safeCode = safeCode;
    this.status = status;
  }
}
