export type MetaApiErrorDetails = {
  status?: number | null;
  metaCode?: number | null;
  metaSubcode?: number | null;
  metaMessage?: string | null;
};

export class MetaApiError extends Error {
  readonly safeCode: string;
  readonly status: number | null;
  readonly metaCode: number | null;
  readonly metaSubcode: number | null;
  readonly metaMessage: string | null;

  constructor(safeCode: string, details: MetaApiErrorDetails = {}) {
    super("Meta request failed");
    this.name = "MetaApiError";
    this.safeCode = safeCode;
    this.status = details.status ?? null;
    this.metaCode = details.metaCode ?? null;
    this.metaSubcode = details.metaSubcode ?? null;
    this.metaMessage = details.metaMessage ?? null;
  }
}
