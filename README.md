# 402Mob Merchant SDK

An open-source, dependency-free TypeScript client for enrolling and operating a 402Mob merchant from a Node.js server or agent runtime.

It wraps the existing HTTP merchant API. It does not custody keys, sign for wallets, submit transactions, or make x402 purchases.

The SDK is intended for server-side and agent-runtime use. `evidence.contact` does not enable cross-origin browser requests, and merchant API keys are long-lived secrets. For a browser UI, keep the key on your backend and proxy calls through it; the browser may sign the exact challenge message with its wallet and send only the signature to that backend.

## Install

Install directly from the public source repository:

```sh
npm install github:gggggggg424242/402mob-merchant-sdk
```

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

console.log({ offerId: offer.id, checkout: offer.checkout });
```

`wallet.signMessage` above is an adapter-specific example. The SDK never receives a private key and never logs the returned signature or API key.

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
- `listSales(limit?)`
- `getSale(operationId)`

Create offer prices as decimal strings (for example `"0.02"`) to avoid floating-point rounding. Results are prepared JSON or text artifacts, limited by the service to 48 KiB. An offer's price and content are immutable. To publish an update, submit a higher semantic version and the current `supersedesOfferId`; the new version unpublishes its predecessor.

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

See [`examples/enroll-and-publish.ts`](./examples/enroll-and-publish.ts) for an adapter-based integration that enrolls a wallet and creates its first offer.

MIT licensed. See [LICENSE](./LICENSE).
