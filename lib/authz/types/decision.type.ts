/**
 * The outcome of evaluating a requirement (or a set of requirements).
 * Handlers may return a plain boolean for convenience; it is normalized to
 * this shape by the {@link AuthorizationService}.
 */
export interface AuthorizationDecision {
  /** Whether access is granted. */
  granted: boolean;

  /** Optional human-readable reason, surfaced for logging/diagnostics. */
  reason?: string;

  /** The requirement type that produced a denial, when applicable. */
  failedRequirementType?: string;
}
