import { MerchantClient, type ResolveAgentResourcesInput } from "../dist/index.js";

/** Public, read-only discovery for a buyer agent; checkout remains a separate step. */
export async function resolveAgentResources(input: ResolveAgentResourcesInput = {}) {
  const buyer = new MerchantClient();
  const page = await buyer.resolveResources(input);

  return page.items.map(({ merchant, offer }) => ({
    providerId: merchant.id,
    providerName: merchant.name,
    offerId: offer.id,
    title: offer.title,
    description: offer.description,
    amountUSDC: offer.amountUSDC,
    contentType: offer.contentType,
    checkout: offer.checkout,
    latest: offer.latest,
  }));
}
