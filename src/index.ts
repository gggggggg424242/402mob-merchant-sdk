export type EvmAddress = `0x${string}`;
export type EvmSignature = `0x${string}`;
export type TransactionHash = `0x${string}`;
export type ProofMethod = "approve_zero" | "transfer_zero";
export type ArtifactContentType = "application/json" | "text/plain; charset=utf-8";
export type WorkTicketState = "open" | "claimed" | "quoted" | "accepted" | "paying" | "paid" | "delivered" | "accepted_by_buyer" | "disputed" | "expired";

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
  /** Present in authenticated merchant workspace responses; opt-in controls directory search. */
  discoverable?: boolean;
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

/** Public provider fields returned while an agent resolves available resources. */
export interface AgentResourceProvider {
  id: string;
  name: string;
  /** Present in directory results; points to the provider's public profile. */
  profile?: string;
  /** Present in direct profile and latest-resource lookups. */
  payoutAddress?: EvmAddress;
  createdAt?: string;
}

/** A provider-published, fixed-price resource descriptor. */
export interface AgentResource {
  id: string;
  seriesId: string;
  version: string;
  title: string;
  description: string;
  amountAtomic: string;
  amountUSDC: string;
  contentType: ArtifactContentType;
  latest: string;
  checkout: string;
  directTransferChallenge: string;
  supersedesOfferId?: string | null;
}

export interface ResolvedAgentResource {
  merchant: AgentResourceProvider;
  offer: AgentResource;
}

export interface AgentResourcePage {
  items: ResolvedAgentResource[];
  nextCursor: number | null;
}

export interface ResolveAgentResourcesInput {
  /** Searches provider names, resource titles, and descriptions; maximum 80 characters. */
  query?: string;
  /** Page size from 1 through 50; defaults to 20. */
  limit?: number;
  /** Zero-based result offset; defaults to 0. */
  cursor?: number;
}

export interface AgentProviderCatalog {
  merchant: AgentResourceProvider & { payoutAddress: EvmAddress; createdAt: string };
  offers: AgentResource[];
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

export interface WorkTicketSummary {
  id: string;
  buyer: EvmAddress;
  merchantId: string;
  capability: string;
  inputHash: string;
  maxPriceAtomic: string;
  maxPriceUSDC: string;
  state: WorkTicketState;
  createdAt: string;
  expiresAt: string;
  claimExpiresAt: string | null;
  quote: null | { id: string; amount: string; amountAtomic: string; amountUSDC: string; deliverable: string; contentType: ArtifactContentType; termsHash: string; expiresAt: string };
  payment: { operationId: string | null; transaction: TransactionHash | null };
  result: { sha256: string | null; contentType: ArtifactContentType | null };
  buyerReceipt: null | { verdict: "accepted" | "disputed"; challengeId: string; message: string; signature: EvmSignature; createdAt: string };
}

/** Authenticated inbox/detail/claim responses include private input, or null after retention. */
export interface MerchantWorkTicket extends WorkTicketSummary { input: unknown }
/** Public status excludes the buyer wallet, private input, and signed buyer receipt. */
export type PublicWorkTicket = Omit<WorkTicketSummary, "buyer" | "buyerReceipt">;

export interface WorkTicketInbox { tickets: MerchantWorkTicket[] }
export interface MerchantWorkQuoteInput {
  priceUSDC: string;
  deliverable: string;
  contentType: ArtifactContentType;
  expiresInSeconds: number;
}
export type MerchantWorkResultInput =
  | { contentType: "application/json"; result: JsonValue }
  | { contentType: "text/plain; charset=utf-8"; result: string };

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
 * Minimal, dependency-free HTTP client for 402Mob agent resource resolution and merchant management.
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

  /** Search publicly discoverable prepared resources. This read-only call needs no API key. */
  async resolveResources(input: ResolveAgentResourcesInput = {}): Promise<AgentResourcePage> {
    const query = input.query ?? "";
    const limit = input.limit ?? 20;
    const cursor = input.cursor ?? 0;
    if (typeof query !== "string" || query.trim().length > 80) {
      throw new TypeError("query must be a string no longer than 80 characters.");
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new TypeError("limit must be an integer from 1 through 50.");
    }
    if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > 100_000_000) {
      throw new TypeError("cursor must be an integer from 0 through 100000000.");
    }

    const params = new URLSearchParams({ q: query.trim(), limit: String(limit), cursor: String(cursor) });
    const payload = await this.request<unknown>("GET", `/v1/merchant-directory?${params}`);
    if (!isRecord(payload) || !Array.isArray(payload.items) ||
        !(payload.nextCursor === null || (Number.isSafeInteger(payload.nextCursor) && (payload.nextCursor as number) >= 0)) ||
        !payload.items.every(isResolvedAgentResource)) {
      throw invalidPublicResponse();
    }
    return payload as unknown as AgentResourcePage;
  }

  /** Read one provider's public profile and published resource descriptors by known ID. */
  async getProviderResources(merchantId: string): Promise<AgentProviderCatalog> {
    if (!nonempty(merchantId)) throw new TypeError("merchantId must be a nonempty string.");
    const payload = await this.request<unknown>("GET", `/v1/merchants/${encodeURIComponent(merchantId)}`);
    if (!isRecord(payload) || !isProviderProfile(payload.merchant) || !Array.isArray(payload.offers) ||
        !payload.offers.every(isAgentResource)) {
      throw invalidPublicResponse();
    }
    return payload as unknown as AgentProviderCatalog;
  }

  /** Resolve an older resource ID to its currently published version. This call is public. */
  async resolveLatestResource(merchantId: string, offerId: string): Promise<ResolvedAgentResource> {
    if (!nonempty(merchantId) || !nonempty(offerId)) {
      throw new TypeError("merchantId and offerId must be nonempty strings.");
    }
    const path = `/v1/merchants/${encodeURIComponent(merchantId)}/offers/${encodeURIComponent(offerId)}/latest`;
    const payload = await this.request<unknown>("GET", path);
    if (!isRecord(payload) || !isPublicProvider(payload.merchant) || !isAgentResource(payload.offer)) {
      throw invalidPublicResponse();
    }
    return payload as unknown as ResolvedAgentResource;
  }

  setDiscoverable(discoverable: boolean): Promise<{ merchantId: string; discoverable: boolean }> {
    return this.request("PUT", "/v1/agent/merchant/discovery", { discoverable }, true);
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

  /** Read this merchant's private work inbox; requires the merchant:work scope. */
  listWorkTickets(input: { states?: WorkTicketState[]; limit?: number } = {}): Promise<WorkTicketInbox> {
    const limit = input.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new TypeError("limit must be an integer from 1 through 50.");
    const query = new URLSearchParams({ limit: String(limit) });
    if (input.states !== undefined) {
      if (!Array.isArray(input.states) || input.states.length === 0 || input.states.length > 10 || !input.states.every(state => workTicketStates.includes(state))) {
        throw new TypeError("states must contain 1–10 supported Work Ticket states.");
      }
      query.set("states", input.states.join(","));
    }
    return this.request("GET", `/v1/agent/work-tickets?${query}`, undefined, true);
  }

  /** Public progress and recovery metadata; no API key, private input, or result bytes. */
  getWorkTicketStatus(ticketId: string): Promise<{ ticket: PublicWorkTicket }> {
    return this.request("GET", `/v1/work-tickets/${checkedWorkTicketId(ticketId)}`);
  }

  /** Claim a ticket addressed to this merchant for a bounded lease. */
  claimWorkTicket(ticketId: string, leaseSeconds = 600): Promise<{ ticket: MerchantWorkTicket }> {
    if (!Number.isInteger(leaseSeconds) || leaseSeconds < 30 || leaseSeconds > 3600) throw new TypeError("leaseSeconds must be an integer from 30 through 3600.");
    return this.request("POST", `/v1/agent/work-tickets/${checkedWorkTicketId(ticketId)}/claims`, { leaseSeconds }, true);
  }

  /** Submit one fixed quote; the server rejects amounts above the buyer-signed cap. */
  quoteWorkTicket(ticketId: string, input: MerchantWorkQuoteInput): Promise<{ ticket: WorkTicketSummary; acceptanceChallenge: string }> {
    if (!Number.isInteger(input.expiresInSeconds) || input.expiresInSeconds < 30 || input.expiresInSeconds > 3600) throw new TypeError("expiresInSeconds must be an integer from 30 through 3600.");
    return this.request("POST", `/v1/agent/work-tickets/${checkedWorkTicketId(ticketId)}/quotes`, input, true);
  }

  /** Read this merchant's own ticket, including input and buyer receipt metadata. */
  getWorkTicket(ticketId: string): Promise<{ ticket: MerchantWorkTicket }> {
    return this.request("GET", `/v1/agent/work-tickets/${checkedWorkTicketId(ticketId)}`, undefined, true);
  }

  /** Submit a bounded result after the checkout operation is confirmed settled. */
  submitWorkTicketResult(ticketId: string, input: MerchantWorkResultInput): Promise<{ ticket: WorkTicketSummary; buyerResultChallenge: string; retentionDays: number }> {
    return this.request("POST", `/v1/agent/work-tickets/${checkedWorkTicketId(ticketId)}/results`, input, true);
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
      redirect: "error",
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (response.ok) throw new MerchantApiError(response.status, "invalid_response", "402Mob returned an unreadable response. The request may have completed; do not assume it failed.");
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
    const invalidResponse = () => new MerchantApiError(response.status, "invalid_response", "402Mob returned an incomplete response. The request may have completed; preserve recovery data. If enrollment or rotation completed without a usable key, use credential rotation.");
    if (!isRecord(payload)) throw invalidResponse();
    if (path === "/v1/merchants/enrollment-challenges" || path === "/v1/merchants/credential-challenges") {
      const proof = payload.transactionProof;
      if (!nonempty(payload.challengeId) || !nonempty(payload.message) || !nonempty(payload.expiresAt) ||
          !Number.isFinite(Date.parse(payload.expiresAt)) || !isRecord(proof) ||
          proof.network !== "eip155:8453" || !address(proof.asset) || !address(proof.proofAddress) ||
          !isRecord(proof.approve) || !isRecord(proof.send) ||
          typeof proof.approve.spender !== "string" || proof.approve.spender.toLowerCase() !== proof.proofAddress.toLowerCase() ||
          typeof proof.send.recipient !== "string" || proof.send.recipient.toLowerCase() !== proof.proofAddress.toLowerCase() ||
          proof.approve.amountAtomic !== "0" || proof.send.amountAtomic !== "0" ||
          typeof proof.requiredConfirmations !== "string" || !/^[1-9][0-9]*$/.test(proof.requiredConfirmations)) throw invalidResponse();
    }
    if (["/v1/merchants/enrollments", "/v1/merchants/enrollments/transaction", "/v1/merchants/credentials/rotate", "/v1/merchants/credentials/rotate-transaction"].includes(path)) {
      if (!isRecord(payload.merchant) || !nonempty(payload.merchant.id) || !nonempty(payload.apiKey)) throw invalidResponse();
    }
    return payload as T;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonempty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function address(value: unknown): value is EvmAddress { return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value); }

function isAgentResource(value: unknown): value is AgentResource {
  if (!isRecord(value)) return false;
  const amountAtomic = value.amountAtomic;
  const amountUSDC = value.amountUSDC;
  return nonempty(value.id) && nonempty(value.seriesId) && nonempty(value.version) &&
    nonempty(value.title) && typeof value.description === "string" &&
    typeof amountAtomic === "string" && /^[1-9][0-9]*$/.test(amountAtomic) &&
    typeof amountUSDC === "string" && /^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(amountUSDC) &&
    (value.contentType === "application/json" || value.contentType === "text/plain; charset=utf-8") &&
    nonempty(value.latest) && nonempty(value.checkout) && nonempty(value.directTransferChallenge) &&
    (value.supersedesOfferId === undefined || value.supersedesOfferId === null || nonempty(value.supersedesOfferId));
}

function isResolvedAgentResource(value: unknown): value is ResolvedAgentResource {
  if (!isRecord(value) || !isRecord(value.merchant)) return false;
  return nonempty(value.merchant.id) && nonempty(value.merchant.name) && nonempty(value.merchant.profile) &&
    isAgentResource(value.offer);
}

function isProviderProfile(value: unknown): value is AgentProviderCatalog["merchant"] {
  return isRecord(value) && nonempty(value.id) && nonempty(value.name) && address(value.payoutAddress) &&
    nonempty(value.createdAt) && Number.isFinite(Date.parse(value.createdAt));
}

function isPublicProvider(value: unknown): value is AgentResourceProvider & { payoutAddress: EvmAddress } {
  return isRecord(value) && nonempty(value.id) && nonempty(value.name) && address(value.payoutAddress);
}

function invalidPublicResponse(): MerchantApiError {
  return new MerchantApiError(200, "invalid_response", "402Mob returned an incomplete public resource response.");
}

const workTicketStates: readonly WorkTicketState[] = ["open", "claimed", "quoted", "accepted", "paying", "paid", "delivered", "accepted_by_buyer", "disputed", "expired"];
function checkedWorkTicketId(id: string): string {
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new TypeError("ticketId must be a UUID.");
  }
  return id;
}
