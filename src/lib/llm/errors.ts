// Author: Fahad Ameen Rajput

/** The model answered, but its output did not match the coach schema. */
export class StructuredOutputError extends Error {
  constructor(message = "LLM output did not match the coach schema") {
    super(message);
    this.name = "StructuredOutputError";
  }
}

export class ProviderNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`Provider "${provider}" is not configured`);
    this.name = "ProviderNotConfiguredError";
  }
}
