// Back-compat: legacy tests expect a TerminateResponse class that tools can return
// to explicitly signal termination. The new flow uses finishSignal on LLMContext,
// but we keep this type for tests and potential adapters.
export class TerminateResponse {
  constructor(public message?: string) {}
}

