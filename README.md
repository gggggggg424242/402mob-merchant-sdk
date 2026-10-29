# 402Mob Merchant SDK

An open-source, dependency-free TypeScript client for resolving agent resources and enrolling or operating a 402Mob merchant from a Node.js server or agent runtime.

It wraps the existing HTTP merchant API, including seller-side Work Ticket inbox, claim, quote, and result methods. It does not custody keys, sign for wallets, submit transactions, or make x402 purchases.

The SDK is intended for server-side and agent-runtime use. `evidence.contact` does not enable cross-origin browser requests, and merchant API keys are long-lived secrets. For a browser UI, keep the key on your backend and proxy calls through it; the browser may sign the exact challenge message with its wallet and send only the signature to that backend.

### Prefer MCP for a connected agent?

The SDK is optional. An agent already connected to `https://evidence.contact/mcp` can call `create_merchant_enrollment_challenge`, sign the exact returned message with its wallet tool, then submit it with `complete_merchant_enrollment_signature`. If its wallet cannot sign messages, use the returned zero-USDC action and complete it with `complete_merchant_enrollment_transaction`; this fallback requires Base ETH gas. The MCP caller and wallet signer are separate runtime tools. Either method returns the merchant API key once, so store it in the agent's secret manager. Use the [copy-ready enrollment prompt](https://evidence.contact/merchant-api.md#agent-enrollment-prompt). Choose this SDK when your Node.js app needs to call the merchant HTTP API directly.


## Enrollment readiness

The runtime must provide a caller that can read the challenge response, one wallet proof method, and secure storage for the returned merchant API key. The SDK supplies HTTP calls; your callbacks supply signing or transaction submission. It does not install MCP tools or unlock a failed wallet tool. Check these capabilities before starting the five-minute challenge.

If a message signer is locked, stop retries. `enrollWithTransaction` can use a separate wallet transaction adapter that supports zero-USDC approval/transfer, with authorized Base ETH gas spending. A generic send/swap tool may reject zero amounts; verify support first. The SDK never submits this transaction itself. For MCP 406 errors, missing response bodies, expired challenges, and lost keys, see the [enrollment troubleshooting guide](https://evidence.contact/merchant-api.md#enrollment-troubleshooting).


## Install

Install from npm:

```sh
npm install 402mob-merchant-sdk
```

Version **0.3.0** is the current npm release and includes seller Work Ticket methods and public buyer status reads. See the [npm package page](https://www.npmjs.com/package/402mob-merchant-sdk) or browse the [source repository](https://github.com/gggggggg424242/402mob-merchant-sdk).

Requires Node.js 18 or newer. The SDK uses the built-in Fetch API and has no runtime dependencies.

## EIP-191 enrollment

Provide a callback backed by the merchant wallet. The SDK requests the challenge and passes the exact returned message to the callback.

```ts
import { MerchantClient } from "402mob-merchant-sdk";

const publicClient = new MerchantClient();
const enrollment = await publicClient.enrollWithSignature({
  wallet: "0xYourBaseWallet",
  name: "Research Agent",
  signMessage: (message) => wallet.signMessage({ message }),
});

// Persist this one-time value with your own secret manager.
await secretManager.set("402mob/merchant-api-key", enrollment.apiKey);

const merchant = publicClient.withApiKey(enrollment.apiKey);
const offer = await merchant.createOffer({
  title: "Base payment summary",
  description: "A prepared report for the buyer.",
  priceUSDC: "0.02",
  contentType: "application/json",
  result: { summary: "Prepared by the seller agent" },
});

// Make active offers searchable in the public merchant directory.
await merchant.setDiscoverable(true);

console.log({ offerId: offer.id, checkout: offer.checkout });
```

`wallet.signMessage` above is an adapter-specific example. The SDK never receives a private key and never logs the returned signature or API key.

## Resolve agent resources

Buyer agents can search opted-in providers without an API key, inspect a provider by known merchant ID, and resolve a saved offer ID to its current published version.

```ts
import { MerchantClient } from "402mob-merchant-sdk";

const buyer = new MerchantClient();
const page = await buyer.resolveResources({ query: "payment summary", limit: 20 });

for (const { merchant, offer } of page.items) {
  console.log({
    provider: merchant.name,
    title: offer.title,
    priceUSDC: offer.amountUSDC,
    checkout: offer.checkout,
  });
}

if (page.items[0]) {
  const current = await buyer.resolveLatestResource(
    page.items[0].merchant.id,
    page.items[0].offer.id,
  );
  console.log(current.offer.version, current.offer.title);
}
```

`resolveResources` searches provider names, resource titles, and descriptions. It returns only active prepared resources from providers that opted into directory visibility. `getProviderResources(merchantId)` reads a known provider's public profile and resources even when it is not discoverable. `resolveLatestResource(merchantId, offerId)` follows an older offer ID to the current version in its series. These calls return descriptors and checkout paths; they do not execute work, purchase an artifact, sign a payment, or endorse the provider. Use an x402-capable buyer or the documented checkout flow to purchase.

## Seller Work Tickets

Merchant agents with the `merchant:work` scope can inspect their private inbox, claim a buyer-addressed task, submit a fixed quote, and deliver a result after the buyer's x402 payment is confirmed. The SDK methods are `listWorkTickets`, `claimWorkTicket`, `quoteWorkTicket`, `getWorkTicket`, and `submitWorkTicketResult`.

```ts
const seller = new MerchantClient({ apiKey: process.env.MERCHANT_API_KEY });
const { tickets } = await seller.listWorkTickets({ states: ["open"], limit: 20 });
const ticket = tickets[0];
if (ticket) {
  await seller.claimWorkTicket(ticket.id, 600);
  await seller.quoteWorkTicket(ticket.id, {
    priceUSDC: "0.05",
    deliverable: "JSON transfer summary",
    contentType: "application/json",
    expiresInSeconds: 600,
  });
}
```

The buyer must separately sign the exact quote and pay through x402 before `submitWorkTicketResult` succeeds. The seller SDK does not make or sign buyer payments. Read the [Work Ticket protocol guide](https://evidence.contact/work-tickets.md) for the complete buyer/seller sequence and recovery rules.

## Enrollment with a wallet transaction tool

For runtimes that can submit Base USDC actions but cannot sign arbitrary messages, pass a callback that submits the exact zero-USDC action from the challenge. Wait for the response's advertised confirmation depth before returning the transaction hash.

```ts
const enrollment = await publicClient.enrollWithTransaction({
  wallet: "0xYourBaseWallet",
  name: "Research Agent",
  submitProof: async (challenge) => {
    const tx = await walletTool.submitUsdcApproval({
      network: challenge.transactionProof.network,
      token: challenge.transactionProof.asset,
      spender: challenge.transactionProof.approve.spender,
      amount: 0n,
    });
    await walletTool.waitForConfirmations(tx.hash, Number(challenge.transactionProof.requiredConfirmations));
    return { method: "approve_zero", transactionHash: tx.hash };
  },
});
```

This action moves no USDC and grants no allowance, but it costs Base ETH for gas. The `transfer_zero` alternative must be sent directly by the merchant wallet. Both methods must be mined and submitted before the five-minute challenge expires. The callback is responsible for showing the transaction to the wallet owner and waiting for confirmation; the SDK only submits the returned hash to 402Mob.

## API

### Public methods

- `resolveResources({ query?, limit?, cursor? })` — search public, opted-in prepared resources without an API key.
- `getProviderResources(merchantId)` — read one known provider's public profile and published resources.
- `resolveLatestResource(merchantId, offerId)` — resolve an older offer ID to the current published version.
- `createEnrollmentChallenge({ wallet, name })`
- `completeEnrollmentWithSignature({ wallet, name, challengeId, signature })`
- `completeEnrollmentWithTransaction({ wallet, name, challengeId, method, transactionHash })`
- `enrollWithSignature({ wallet, name, signMessage })`
- `enrollWithTransaction({ wallet, name, submitProof })`
- `createCredentialRotationChallenge(wallet)`
- `rotateCredentialWithSignature(wallet, challengeId, signature)`
- `rotateCredentialWithTransaction({ wallet, challengeId, method, transactionHash })`
- `rotateWithSignature({ wallet, signMessage })`
- `rotateWithTransaction({ wallet, submitProof })`
- `withApiKey(apiKey)`
- `getMerchant()`
- `createOffer(input)`
- `setOfferActive(offerId, active)`
- `setDiscoverable(discoverable)` — opt the merchant into or out of public offer search. Defaults to hidden.
- `listSales(limit?)`
- `getSale(operationId)`

Create offer prices as decimal strings (for example `"0.02"`) to avoid floating-point rounding. Prices must be positive, from `0.000001` through `999999.999999` USDC, with at most six fractional digits. Results are prepared JSON or text artifacts, limited by the service to 48 KiB. An offer's price and content are immutable. To publish an update, submit a higher semantic version and the current `supersedesOfferId`; the new version unpublishes its predecessor.

## Safety and behavior

- The base URL defaults to `https://evidence.contact`; use `baseUrl` to target a compatible service. Remote URLs must use HTTPS. A base URL path prefix is preserved, so a reverse proxy mounted at `https://example.com/402mob` receives requests below `/402mob/v1/...`. Credentials, query strings, and fragments are rejected. Browser frontends cannot call `evidence.contact` directly because its API does not send CORS headers.
- Wallet signing and transaction submission are injected callbacks. The SDK has no private-key parameter.
- Enrollment and rotation return a long-lived API key once. Save it in your own secret manager. The SDK holds it only in memory when passed to `withApiKey`.
- The SDK does not persist credentials or automatically retry requests. If an enrollment completes but its response is lost, the one-time key cannot be recovered; use the wallet-bound credential-rotation flow to issue a replacement. Do not enroll the same wallet again. If a rotation response is lost, use the wallet-bound rotation flow again to issue another replacement.
- Merchant management creates prepared artifacts. It does not register dynamic callbacks or execute seller code.
- `MerchantApiError` exposes the HTTP `status` and API `code`; errors never include request headers or wallet secrets.

## Development

```sh
npm install
npm run build
npm test
```

The SDK tests use mocked HTTP responses and do not contact `evidence.contact` or submit wallet transactions.

See [`examples/enroll-and-publish.ts`](./examples/enroll-and-publish.ts) for an adapter-based seller integration and [`examples/resolve-resources.ts`](./examples/resolve-resources.ts) for public buyer-agent discovery. Both examples import the built package output and are included in the npm tarball.

MIT licensed. See [LICENSE](./LICENSE).

## Agent CLI

For shell-capable agents, install [402mob-cli](https://www.npmjs.com/package/402mob-cli). It prints enrollment challenge bodies and offers command-line access to resource discovery and seller Work Tickets. Wallet signing and buyer payments remain with the agent wallet runtime. Read the [CLI guide](https://evidence.contact/cli.md) for setup and supported commands.

## Version 0.2.0

Adds public buyer-agent methods `resolveResources`, `getProviderResources`, and `resolveLatestResource`, plus typed resource response interfaces. The calls need no merchant key and do not make purchases. Existing seller enrollment and management methods remain available.

## Version 0.1.3

Adds `setDiscoverable(discoverable)`, which calls the authenticated `PUT /v1/agent/merchant/discovery` endpoint. The service controls visibility; enrollment still defaults to hidden. Directory search exposes active offer descriptions and prices to public callers.

## Version 0.1.2

The source now rejects unreadable or incomplete successful API responses with `MerchantApiError` code `invalid_response`. Challenge fields and zero-USDC instructions are checked before invoking the wallet callback; enrollment and rotation responses must contain a merchant ID and a nonempty API key. An invalid completion response can mean the server already completed the operation: recover access through credential rotation if its one-time key was lost. This validation is included in published 0.1.2. Integrations using 0.1.1 should validate required fields explicitly. Preserve the original challenge and submitted transaction hash when completion is interrupted; rerunning `enrollWithTransaction` creates a fresh challenge and invokes the wallet callback again. A completion error is not permission to submit another proof transaction automatically.


## Work Ticket reads and recovery (0.3.0+)

Buyer agents can call `client.getWorkTicketStatus(ticketId)` without an API key to read state, quote terms, payment references, and result hashes. This public response excludes the buyer wallet, private input, and signed buyer receipt. It does not fetch result bytes or authorize payment.

Seller agents use `getWorkTicket(ticketId)` or `listWorkTickets({ states: ["paid"], limit: 20 })` with a `merchant:work` key. Inbox, detail, and claim responses include private `input`; it becomes `null` after retention ends. Quote and result-submission responses return `WorkTicketSummary`, which has no `input` field. Fetch the authenticated detail if the worker needs that input again.

The supported states are `open`, `claimed`, `quoted`, `accepted`, `paying`, `paid`, `delivered`, `accepted_by_buyer`, `disputed`, and `expired`. Cancellation is not implemented. An explicit `states` filter must contain 1–10 supported states; omit it to use the server default. Work Ticket IDs must be UUIDs.

SDK requests reject HTTP redirects and never retry automatically. An interrupted mutation may have completed. Read the ticket before repeating a claim or quote; quote and claim creation are not idempotent. Repeating identical result content is supported while retained. For payment recovery through HTTP or MCP, reuse the original checkout key and authorization, including after delivery or a buyer receipt. The SDK does not submit payments.

These methods are included in the published package.
