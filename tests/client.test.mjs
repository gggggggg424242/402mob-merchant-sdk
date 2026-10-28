import assert from "node:assert/strict";
import test from "node:test";
import { MerchantApiError, MerchantClient } from "../dist/index.js";

const wallet = "0x1111111111111111111111111111111111111111";
const signature = `0x${"a".repeat(130)}`;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("merchant API key is not exposed by ordinary object serialization", () => {
  const secret = "merchant-secret-value";
  const client = new MerchantClient({ apiKey: secret });

  assert.equal(JSON.stringify(client).includes(secret), false);
  assert.equal(Object.keys(client).includes("#apiKey"), false);
});

test("base URL path prefixes survive requests and withApiKey", async () => {
  const requested = [];
  const fetch = async (url) => {
    requested.push(String(url));
    return jsonResponse({ merchant: {}, offers: [] });
  };
  const client = new MerchantClient({
    baseUrl: "https://api.example.test/402mob/",
    fetch,
  }).withApiKey("key");

  await client.getMerchant();

  assert.equal(requested[0], "https://api.example.test/402mob/v1/agent/merchant");
});

test("rejects insecure remote URLs and ambiguous base URLs", () => {
  for (const baseUrl of [
    "http://api.example.test",
    "https://user:password@api.example.test",
    "https://api.example.test?tenant=one",
    "https://api.example.test/#fragment",
  ]) {
    assert.throws(() => new MerchantClient({ baseUrl }), TypeError, baseUrl);
  }

  assert.doesNotThrow(() => new MerchantClient({ baseUrl: "http://localhost:3000/402mob" }));
});

test("enrollment signs the exact challenge message and submits its challenge ID", async () => {
  const calls = [];
  const challenge = {
    challengeId: "challenge-123",
    message: "Exact server-provided EIP-191 message",
  };
  const enrolled = { apiKey: "one-time-key", merchant: { id: "merchant-1" } };
  const fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return calls.length === 1 ? jsonResponse(challenge) : jsonResponse(enrolled);
  };
  const client = new MerchantClient({ baseUrl: "http://localhost:3000", fetch });
  const signedMessages = [];

  const result = await client.enrollWithSignature({
    wallet,
    name: "Agent Seller",
    signMessage: async (message) => {
      signedMessages.push(message);
      return signature;
    },
  });

  assert.deepEqual(signedMessages, [challenge.message]);
  assert.equal(calls[0].url, "http://localhost:3000/v1/merchants/enrollment-challenges");
  assert.equal(calls[1].url, "http://localhost:3000/v1/merchants/enrollments");
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    wallet,
    name: "Agent Seller",
    challengeId: "challenge-123",
    signature,
  });
  assert.equal(result.apiKey, "one-time-key");
});

test("merchant bearer key is sent only on authenticated requests", async () => {
  const authHeaders = [];
  const fetch = async (_url, init) => {
    authHeaders.push(init.headers.Authorization);
    return jsonResponse({ merchant: {}, offers: [] });
  };
  const client = new MerchantClient({ baseUrl: "http://localhost:3000", fetch });

  await client.createEnrollmentChallenge({ wallet, name: "Agent Seller" });
  await client.withApiKey("merchant-key").getMerchant();

  assert.deepEqual(authHeaders, [undefined, "Bearer merchant-key"]);
});

test("API errors retain status and error code without exposing request headers", async () => {
  const secret = "merchant-key-must-not-appear-in-error";
  const fetch = async () => jsonResponse({ error: "invalid_request", message: "Request rejected." }, 422);
  const client = new MerchantClient({ baseUrl: "http://localhost:3000", apiKey: secret, fetch });

  await assert.rejects(client.getMerchant(), (error) => {
    assert.ok(error instanceof MerchantApiError);
    assert.equal(error.status, 422);
    assert.equal(error.code, "invalid_request");
    assert.equal(error.message, "Request rejected.");
    assert.equal(error.message.includes(secret), false);
    return true;
  });
});
