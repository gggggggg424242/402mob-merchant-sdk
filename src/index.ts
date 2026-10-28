export type EvmAddress = `0x${string}`;
export type EvmSignature = `0x${string}`;
export type TransactionHash = `0x${string}`;
export type ProofMethod = "approve_zero" | "transfer_zero";
export type ArtifactContentType = "application/json" | "text/plain; charset=utf-8";

export interface EnrollmentChallenge {
  challengeId: string;
  message: string;
  expiresAt: string;
  signature: string;
  transactionProof: {
    network: "eip155:8453";
    asset: EvmAddress;
    proofAddress: EvmAddress;
    approve: { spender: EvmAddress; amountAtomic: "0" };
    send: { recipient: EvmAddress; amountAtomic: "0" };
    submit: string;
    requiredConfirmations: string;
    note: string;
  };
}

export interface CredentialChallenge extends EnrollmentChallenge {}

export interface MerchantProfile {
  id: string;
  agentId: string;
  name: string;
  payoutAddress: EvmAddress;
  createdAt: string;
}

export interface MerchantAgent {
  id: string;
  name: string;
  scopes: string[];
}

export interface EnrollmentResult {
  merchant: MerchantProfile;
  agent: MerchantAgent;
  /** Returned once. Store it in the integrating application's secret manager. */
  apiKey: string;
  warning: string;
  proof?: {
    method: ProofMethod;
    network: "eip155:8453";
    transactionHash: TransactionHash;
    blockNumber: string;
    confirmations: string;
  };
}

export interface CredentialRotationResult {
  merchant: MerchantProfile;
  /** Replacement returned once. Store it in the integrating application's secret manager. */
  apiKey: string;
  warning: string;
  proof?: {
    method: ProofMethod;
    network: "eip155:8453";
    transactionHash: TransactionHash;
    blockNumber: string;
    confirmations: string;
  };
}

interface MerchantOfferBase {
  id: string;
  merchantId: string;
  seriesId: string;
  version: string;
  supersedesOfferId: string | null;
  title: string;
  description: string;
  amountUSDC: string;
  contentType: ArtifactContentType;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  latest: string;
  checkout: string;
  directTransferChallenge: string;
}

export type MerchantOffer = MerchantOfferBase & (
  | { amount: string; amountAtomic?: never }
  | { amount?: never; amountAtomic: string }
);

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface OfferInputBase {
  title: string;
  description: string;
  priceUSDC: string;
  version?: string;
  supersedesOfferId?: string;
}

export type CreateOfferInput = OfferInputBase & (
  | { contentType: "application/json"; result: JsonValue }
  | { contentType: "text/plain; charset=utf-8"; result: string }
);

export interface MerchantWorkspace {
  merchant: MerchantProfile;
  offers: MerchantOffer[];
}

export interface MerchantSale {
  id: string;
  state: string;
  route: string;
  amountAtomic: string;
  asset: EvmAddress;
  network: "eip155:8453";
  createdAt: string;
  expiresAt: string;
  transaction: TransactionHash | null;
  resultAvailable: boolean;
  error: string | null;
}

export interface SaleList {
  sales: MerchantSale[];
}

export interface SaleDetails {
  sale: MerchantSale;
  responseHash: string | null;
  deliveryReceipts: unknown[];
}

export interface MerchantClientOptions {
  /** Defaults to https://evidence.contact. */
  baseUrl?: string;
  /** Merchant bearer key. The SDK keeps it in memory only. */
  apiKey?: string;
  /** Defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
}

export interface CreateEnrollmentInput {
  wallet: EvmAddress;
  name: string;
}

export interface CompleteSignatureInput extends CreateEnrollmentInput {
  challengeId: string;
  signature: EvmSignature;
}

export interface CompleteTransactionInput extends CreateEnrollmentInput {
  challengeId: string;
  method: ProofMethod;
  transactionHash: TransactionHash;
}

export interface EnrollWithSignatureInput extends CreateEnrollmentInput {
  /** Sign the exact message returned by the challenge endpoint using EIP-191. */
  signMessage(message: string): Promise<EvmSignature>;
}

export interface EnrollWithTransactionInput extends CreateEnrollmentInput {
  /** Submit the exact zero-USDC action from the challenge, then wait for its advertised confirmations. */
  submitProof(challenge: EnrollmentChallenge): Promise<{
    method: ProofMethod;
    transactionHash: TransactionHash;
  }>;
}

export interface CredentialRotationSignatureInput {
  wallet: EvmAddress;
  signMessage(message: string): Promise<EvmSignature>;
}

export interface CredentialRotationTransactionInput {
  wallet: EvmAddress;
  submitProof(challenge: CredentialChallenge): Promise<{
    method: ProofMethod;
    transactionHash: TransactionHash;
  }>;
}

export class MerchantApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MerchantApiError";
  }
}

/**
 * Minimal, dependency-free HTTP client for 402Mob merchant enrollment and management.
 * It never signs messages, submits wallet transactions, persists API keys, or retries requests.
 */
export class MerchantClient {
  private readonly baseUrl: string;
  readonly #apiKey: string | undefined;
  private readonly fetcher: typeof globalThis.fetch;

  constructor(options: MerchantClientOptions = {}) {
    const baseUrl = options.baseUrl ?? "https://evidence.contact";
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new TypeError("baseUrl must use HTTP or HTTPS.");
    }
    if (parsed.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) {
      throw new TypeError("HTTP is allowed only for loopback development URLs; use HTTPS for remote services.");
    }
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new TypeError("baseUrl must not contain credentials, a query, or a fragment.");
    }
    const pathPrefix = parsed.pathname.replace(/\/+$/, "");
    this.baseUrl = `${parsed.origin}${pathPrefix}`;
    this.#apiKey = options.apiKey;
    this.fetcher = options.fetch ?? globalThis.fetch;
    if (typeof this.fetcher !== "function") {
      throw new TypeError("A Fetch API implementation is required.");
    }
  }

  /** Return a new client with the supplied key; no key is written to disk or logged. */
  withApiKey(apiKey: string): MerchantClient {
    return new MerchantClient({ baseUrl: this.baseUrl, apiKey, fetch: this.fetcher });
  }

  createEnrollmentChallenge(input: CreateEnrollmentInput): Promise<EnrollmentChallenge> {
    return this.request("POST", "/v1/merchants/enrollment-challenges", input);
  }

  completeEnrollmentWithSignature(input: CompleteSignatureInput): Promise<EnrollmentResult> {
    return this.request("POST", "/v1/merchants/enrollments", input);
  }

  completeEnrollmentWithTransaction(input: CompleteTransactionInput): Promise<EnrollmentResult> {
    return this.request("POST", "/v1/merchants/enrollments/transaction", input);
  }

  /** Request a challenge, ask the caller's wallet adapter to sign its exact message, then enroll. */
  async enrollWithSignature(input: EnrollWithSignatureInput): Promise<EnrollmentResult> {
    const challenge = await this.createEnrollmentChallenge({ wallet: input.wallet, name: input.name });
    const signature = await input.signMessage(challenge.message);
    return this.completeEnrollmentWithSignature({
      wallet: input.wallet,
      name: input.name,
      challengeId: challenge.challengeId,
      signature,
    });
  }

  /** Request a challenge, delegate its exact zero-value wallet action, then submit the confirmed hash. */
  async enrollWithTransaction(input: EnrollWithTransactionInput): Promise<EnrollmentResult> {
    const challenge = await this.createEnrollmentChallenge({ wallet: input.wallet, name: input.name });
    const proof = await input.submitProof(challenge);
    return this.completeEnrollmentWithTransaction({
      wallet: input.wallet,
      name: input.name,
      challengeId: challenge.challengeId,
      ...proof,
    });
  }

  createCredentialRotationChallenge(wallet: EvmAddress): Promise<CredentialChallenge> {
    return this.request("POST", "/v1/merchants/credential-challenges", { wallet });
  }

  rotateCredentialWithSignature(wallet: EvmAddress, challengeId: string, signature: EvmSignature): Promise<CredentialRotationResult> {
    return this.request("POST", "/v1/merchants/credentials/rotate", { wallet, challengeId, signature });
  }

  rotateCredentialWithTransaction(input: {
    wallet: EvmAddress;
    challengeId: string;
    method: ProofMethod;
    transactionHash: TransactionHash;
  }): Promise<CredentialRotationResult> {
    return this.request("POST", "/v1/merchants/credentials/rotate-transaction", input);
  }

  async rotateWithSignature(input: CredentialRotationSignatureInput): Promise<CredentialRotationResult> {
    const challenge = await this.createCredentialRotationChallenge(input.wallet);
    const signature = await input.signMessage(challenge.message);
    return this.rotateCredentialWithSignature(input.wallet, challenge.challengeId, signature);
  }

  async rotateWithTransaction(input: CredentialRotationTransactionInput): Promise<CredentialRotationResult> {
    const challenge = await this.createCredentialRotationChallenge(input.wallet);
    const proof = await input.submitProof(challenge);
    return this.rotateCredentialWithTransaction({
      wallet: input.wallet,
      challengeId: challenge.challengeId,
      ...proof,
    });
  }

  getMerchant(): Promise<MerchantWorkspace> {
    return this.request("GET", "/v1/agent/merchant", undefined, true);
  }

  createOffer(input: CreateOfferInput): Promise<MerchantOffer> {
    return this.request("POST", "/v1/agent/merchant/offers", input, true);
  }

  setOfferActive(offerId: string, active: boolean): Promise<MerchantOffer> {
    return this.request("PUT", `/v1/agent/merchant/offers/${encodeURIComponent(offerId)}/status`, { active }, true);
  }

  listSales(limit = 50): Promise<SaleList> {
    const query = new URLSearchParams({ limit: String(limit) });
    return this.request("GET", `/v1/agent/merchant/sales?${query}`, undefined, true);
  }

  getSale(operationId: string): Promise<SaleDetails> {
    return this.request("GET", `/v1/agent/merchant/sales/${encodeURIComponent(operationId)}`, undefined, true);
  }

  private async request<T>(method: string, path: string, body?: unknown, authenticated = false): Promise<T> {
    if (authenticated && !this.#apiKey) {
      throw new Error("This request requires a merchant API key. Use client.withApiKey(apiKey).");
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (authenticated && this.#apiKey) headers.Authorization = `Bearer ${this.#apiKey}`;

    const response = await this.fetcher(new URL(`${this.baseUrl}${path}`), {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }

    if (!response.ok) {
      const error = isRecord(payload) ? payload : {};
      throw new MerchantApiError(
        response.status,
        typeof error.error === "string" ? error.error : "http_error",
        typeof error.message === "string" ? error.message : `402Mob returned HTTP ${response.status}.`,
      );
    }
    return payload as T;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
