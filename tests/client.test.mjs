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

const validChallenge = {
  challengeId:"challenge-123",message:"Exact server-provided EIP-191 message",expiresAt:new Date(Date.now()+300000).toISOString(),
  transactionProof:{network:"eip155:8453",asset:wallet,proofAddress:wallet,approve:{spender:wallet,amountAtomic:"0"},send:{recipient:wallet,amountAtomic:"0"},requiredConfirmations:"3"},
};

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
  const challenge = validChallenge;
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
    return jsonResponse(String(_url).endsWith("enrollment-challenges") ? validChallenge : { merchant: {}, offers: [] });
  };
  const client = new MerchantClient({ baseUrl: "http://localhost:3000", fetch });

  await client.createEnrollmentChallenge({ wallet, name: "Agent Seller" });
  await client.withApiKey("merchant-key").getMerchant();

  assert.deepEqual(authHeaders, [undefined, "Bearer merchant-key"]);
});

test("directory visibility uses the authenticated merchant endpoint",async()=>{
  const calls=[];
  const client=new MerchantClient({baseUrl:"http://localhost:3000",apiKey:"merchant-key",fetch:async(url,init)=>{
    calls.push({url:String(url),init});return jsonResponse({merchantId:"merchant-1",discoverable:true});
  }});
  assert.deepEqual(await client.setDiscoverable(true),{merchantId:"merchant-1",discoverable:true});
  assert.equal(calls[0].url,"http://localhost:3000/v1/agent/merchant/discovery");
  assert.equal(calls[0].init.method,"PUT");
  assert.equal(calls[0].init.headers.Authorization,"Bearer merchant-key");
  assert.deepEqual(JSON.parse(calls[0].init.body),{discoverable:true});
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


test("malformed successful challenge responses never reach the signer",async()=>{
  for(const response of [()=>new Response("broken",{status:200}),()=>jsonResponse(null),()=>jsonResponse({}),()=>jsonResponse({...validChallenge,message:""})]) {
    let signed=false;
    const client=new MerchantClient({fetch:async()=>response()});
    await assert.rejects(client.enrollWithSignature({wallet,name:"Agent",signMessage:async()=>{signed=true;return signature;}}),error=>error instanceof MerchantApiError&&error.code==="invalid_response");
    assert.equal(signed,false);
  }
});

test("malformed zero-USDC instructions never reach the transaction adapter",async()=>{
  let submitted=false;
  const client=new MerchantClient({fetch:async()=>jsonResponse({...validChallenge,transactionProof:{...validChallenge.transactionProof,approve:{spender:wallet,amountAtomic:"1"}}})});
  await assert.rejects(client.enrollWithTransaction({wallet,name:"Agent",submitProof:async()=>{submitted=true;throw new Error("unexpected");}}),error=>error.code==="invalid_response");
  assert.equal(submitted,false);
});

test("completion without a usable key reports an uncertain result without leaking body",async()=>{
  const client=new MerchantClient({fetch:async()=>jsonResponse({merchant:{id:"merchant"},apiKey:"",secret:"private-response"},201)});
  await assert.rejects(client.completeEnrollmentWithSignature({wallet,name:"Agent",challengeId:"challenge",signature}),error=>{
    assert.equal(error.code,"invalid_response");assert.match(error.message,/may have completed/);assert.ok(!error.message.includes("private-response"));return true;
  });
});

const ticketId = "12345678-1234-4234-8234-123456789abc";

test("public ticket status omits credentials while seller reads require them", async () => {
  const calls=[];
  const client=new MerchantClient({apiKey:"private-key",fetch:async(url,init)=>{
    calls.push({url:String(url),init});
    return jsonResponse({ticket:{id:ticketId,state:"delivered"}});
  }});
  await client.getWorkTicketStatus(ticketId);
  await client.getWorkTicket(ticketId);
  assert.equal(calls[0].url,`https://evidence.contact/v1/work-tickets/${ticketId}`);
  assert.equal(calls[0].init.headers.Authorization,undefined);
  assert.equal(calls[1].init.headers.Authorization,"Bearer private-key");
  assert.equal(calls[1].init.redirect,"error");
});

test("invalid ticket identifiers and unsupported filters fail before sending credentials", () => {
  let calls=0;
  const client=new MerchantClient({apiKey:"private-key",fetch:async()=>{calls++;return jsonResponse({});}});
  for (const id of ["..","../other","", "not-a-uuid"]) {
    assert.throws(()=>client.getWorkTicket(id),TypeError);
    assert.throws(()=>client.getWorkTicketStatus(id),TypeError);
    assert.throws(()=>client.claimWorkTicket(id),TypeError);
    assert.throws(()=>client.quoteWorkTicket(id,{expiresInSeconds:60}),TypeError);
    assert.throws(()=>client.submitWorkTicketResult(id,{contentType:"application/json",result:{}}),TypeError);
  }
  for(const states of [[],["cancelled"],Array(11).fill("open")]) assert.throws(()=>client.listWorkTickets({states}),TypeError);
  assert.equal(calls,0);
});

test("redirect responses cannot forward merchant credentials or request bodies", async t => {
  const {createServer}=await import("node:http");
  const {once}=await import("node:events");
  let redirected=0;
  const server=createServer((req,res)=>{
    if(req.url==="/redirected") {redirected++;res.writeHead(200,{"Content-Type":"application/json"});res.end("{}");}
    else {res.writeHead(307,{Location:"/redirected"});res.end();}
  }).listen(0,"127.0.0.1");
  await once(server,"listening");
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const client=new MerchantClient({baseUrl:`http://127.0.0.1:${server.address().port}`,apiKey:"private-key"});
  await assert.rejects(client.submitWorkTicketResult(ticketId,{contentType:"application/json",result:{private:"content"}}));
  assert.equal(redirected,0);
});
