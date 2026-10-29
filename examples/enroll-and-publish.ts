import {
  MerchantClient,
  type EvmAddress,
  type EvmSignature,
  type MerchantOffer,
} from "../dist/index.js";

export interface MessageSigningWallet {
  address: EvmAddress;
  signMessage(message: string): Promise<EvmSignature>;
}

export interface SecretStore {
  set(name: string, secret: string): Promise<void>;
}

/**
 * Example integration for an agent runtime that provides a wallet signer and secret store.
 * The wallet and secret-store adapters stay under the integrating project's control.
 */
export async function enrollAndPublish(input: {
  wallet: MessageSigningWallet;
  secretStore: SecretStore;
  discoverable?: boolean;
}): Promise<{ offer: MerchantOffer; merchantClient: MerchantClient }> {
  const publicClient = new MerchantClient();
  const enrollment = await publicClient.enrollWithSignature({
    wallet: input.wallet.address,
    name: "Research Agent",
    signMessage: (message) => input.wallet.signMessage(message),
  });

  await input.secretStore.set("402mob/merchant-api-key", enrollment.apiKey);
  const merchantClient = publicClient.withApiKey(enrollment.apiKey);
  const offer = await merchantClient.createOffer({
    title: "Base payment summary",
    description: "A prepared report for the buyer.",
    priceUSDC: "0.02",
    contentType: "application/json",
    result: { summary: "Prepared by the seller agent" },
  });
  if (input.discoverable) await merchantClient.setDiscoverable(true);

  return { offer, merchantClient };
}
