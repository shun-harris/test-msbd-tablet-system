// msbd-tablet-api — Cloudflare Worker
// Replaces Railway backend for the Check-In Tablet System
// Secrets: STRIPE_SECRET_KEY, PIN_PEPPER, ADMIN_KEY
// KV bindings: CONTACTS (member data), CHECKINS (check-in queue + sessions + pins)

const CLASSES = [
  "7pm Beginner Salsa",
  "8pm Intermediate Salsa Shines",
  "8pm Beginner Afrobeats",
  "9pm Beginner Plus Salsa",
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function normalizePhone(phone) {
  if (!phone) return null;
  return String(phone).replace(/\D/g, "").slice(-10);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function generateToken() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPin(pin, pepper) {
  const data = new TextEncoder().encode(pin + (pepper || "tablet-pepper"));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Stripe REST helpers ──────────────────────────────────────────────────────

async function stripeGet(path, key) {
  const r = await fetch(`https://api.stripe.com${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  return r.json();
}

async function stripePost(path, data, key) {
  // Stripe REST API uses form-encoded bodies
  const body = buildFormBody(data);
  const r = await fetch(`https://api.stripe.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  return r.json();
}

function buildFormBody(obj, prefix = "") {
  const parts = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item) => parts.push(`${encodeURIComponent(key + "[]")}=${encodeURIComponent(item)}`));
    } else if (typeof v === "object") {
      parts.push(buildFormBody(v, key));
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
    }
  }
  return parts.join("&");
}

// ─── Contact lookup from KV ───────────────────────────────────────────────────

async function lookupContact(phone, email, env) {
  const normalizedPhone = normalizePhone(phone);
  let contact = null;

  if (normalizedPhone) {
    const val = await env.CONTACTS.get(`phone:${normalizedPhone}`);
    if (val) contact = JSON.parse(val);
  }

  if (!contact && email) {
    const val = await env.CONTACTS.get(`email:${email.toLowerCase()}`);
    if (val) contact = JSON.parse(val);
  }

  return contact;
}

// ─── Find or create Stripe customer ──────────────────────────────────────────

async function findOrCreateCustomer(phone, email, name, customer_id, key) {
  let customer = null;

  if (customer_id) {
    const c = await stripeGet(`/v1/customers/${customer_id}`, key);
    if (!c.error) customer = c;
  }

  if (!customer && email && !email.includes("@tablet.msbdance.com")) {
    const search = await stripeGet(
      `/v1/customers/search?query=${encodeURIComponent(`email:'${email}'`)}&limit=1`,
      key
    );
    if (search.data?.length > 0) customer = search.data[0];
  }

  if (!customer && phone) {
    const np = normalizePhone(phone);
    const search1 = await stripeGet(
      `/v1/customers/search?query=${encodeURIComponent(`metadata['phone']:'${np}'`)}&limit=1`,
      key
    );
    if (search1.data?.length > 0) {
      customer = search1.data[0];
    } else {
      const search2 = await stripeGet(
        `/v1/customers/search?query=${encodeURIComponent(`phone:'${phone}'`)}&limit=1`,
        key
      );
      if (search2.data?.length > 0) customer = search2.data[0];
    }
  }

  if (!customer) {
    const np = normalizePhone(phone);
    const newCust = {
      name: name || "Dance Student",
      metadata: { source: "tablet_worker", phone: np || "" },
    };
    if (phone) newCust.phone = phone;
    if (email && !email.includes("@tablet.msbdance.com")) newCust.email = email;
    customer = await stripePost("/v1/customers", newCust, key);
  }

  return customer;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleMemberLookup(url, env) {
  const phone = url.searchParams.get("phone");
  const email = url.searchParams.get("email");
  const contact = await lookupContact(phone, email, env);

  if (!contact || contact.contactType !== "member") {
    return json({ exists: false });
  }

  return json({
    result: "yes",
    exists: true,
    ok: true,
    name: `${contact.firstName || ""} ${contact.lastName || ""}`.trim(),
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    classesTaken: contact.classesTaken || 0,
    contactType: "member",
  });
}

async function handleDropInLookup(url, env) {
  const phone = url.searchParams.get("phone");
  const email = url.searchParams.get("email");
  const contact = await lookupContact(phone, email, env);

  if (!contact) return json({ exists: false });

  return json({
    result: "yes",
    exists: true,
    ok: true,
    name: `${contact.firstName || ""} ${contact.lastName || ""}`.trim(),
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    classesTaken: contact.classesTaken || 0,
    contactType: contact.contactType || "contact",
  });
}

async function handleCheckIn(request, env) {
  const body = await request.json();
  const { phone, email, first_name, last_name, classes, payment_amount, payment_method, stripe_payment_id } = body;

  if (!phone && !email) return json({ error: "Phone or email required" }, 400);
  if (!classes || classes.length === 0) return json({ error: "At least one class required" }, 400);

  const id = `checkin:${Date.now()}:${generateToken().slice(0, 8)}`;
  await env.CHECKINS.put(
    id,
    JSON.stringify({
      id,
      phone,
      email,
      first_name,
      last_name,
      classes,
      payment_amount: payment_amount || 0,
      payment_method: payment_method || "MEMBER",
      stripe_payment_id: stripe_payment_id || null,
      checked_in_at: new Date().toISOString(),
      synced: false,
    })
  );

  return json({ success: true, message: "Check-ins recorded", results: classes.map((c) => ({ class: c, synced: false })) });
}

async function handlePaymentIntent(request, env) {
  const key = env.STRIPE_SECRET_KEY;
  const body = await request.json();
  const { amount, currency = "usd", description = "Dance class payment",
          payment_method_id, new_payment_method, product_type,
          phone, name, email, customer_id } = body;

  const customer = await findOrCreateCustomer(phone, email, name, customer_id, key);
  if (customer.error) return json({ error: customer.error.message }, 400);

  const intentData = {
    amount: Math.round(amount * 100),
    currency,
    description,
    confirmation_method: "manual",
    confirm: "true",
    payment_method_types: ["card"],
    customer: customer.id,
    return_url: "https://tablet.msbdance.com/options",
  };

  if (product_type === "single" || product_type === "membership") {
    intentData.setup_future_usage = "on_session";
  }

  if (payment_method_id) {
    // Saved card — validate PIN session
    const auth = (request.headers.get("Authorization") || "").trim();
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return json({ error: "pin_session_required" }, 401);
    const sess = await env.CHECKINS.get(`session:${token}`);
    if (!sess) return json({ error: "pin_session_required" }, 401);
    intentData.payment_method = payment_method_id;
  } else if (new_payment_method) {
    // New card — attach to customer first
    const pm = await stripeGet(`/v1/payment_methods/${new_payment_method}`, key);
    if (!pm.error && !pm.customer) {
      await stripePost(`/v1/payment_methods/${new_payment_method}/attach`, { customer: customer.id }, key);
    }
    intentData.payment_method = new_payment_method;
    intentData.setup_future_usage = "on_session";
  } else {
    intentData.setup_future_usage = "on_session";
  }

  const intent = await stripePost("/v1/payment_intents", intentData, key);
  if (intent.error) return json({ error: intent.error.message }, 400);

  return json({ clientSecret: intent.client_secret, status: intent.status, environment: "production" });
}

async function handleSetupIntent(request, env) {
  const key = env.STRIPE_SECRET_KEY;
  const body = await request.json();
  const { phone, name, email, customer_id } = body;

  const customer = await findOrCreateCustomer(phone, email, name, customer_id, key);
  if (customer.error) return json({ error: customer.error.message }, 400);

  const intent = await stripePost("/v1/setup_intents", {
    customer: customer.id,
    payment_method_types: ["card"],
    usage: "on_session",
  }, key);

  if (intent.error) return json({ error: intent.error.message }, 400);
  return json({ clientSecret: intent.client_secret, customerId: customer.id, status: intent.status });
}

async function handleGetPaymentMethods(request, env) {
  const key = env.STRIPE_SECRET_KEY;
  const body = await request.json();
  const { phone, email } = body;

  // Validate PIN session
  const auth = (request.headers.get("Authorization") || "").trim();
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return json({ error: "pin_session_required" }, 401);
  const sess = await env.CHECKINS.get(`session:${token}`);
  if (!sess) return json({ error: "pin_session_required" }, 401);

  const customer = await findOrCreateCustomer(phone, email, null, null, key);
  if (customer.error || !customer.id) return json({ paymentMethods: [] });

  const methods = await stripeGet(`/v1/customers/${customer.id}/payment_methods?type=card&limit=10`, key);

  return json({
    customerId: customer.id,
    paymentMethods: (methods.data || []).map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand,
      last4: pm.card?.last4,
      exp_month: pm.card?.exp_month,
      exp_year: pm.card?.exp_year,
    })),
  });
}

async function handlePinStatus(request, env) {
  const body = await request.json();
  const { phone, email } = body;
  const np = normalizePhone(phone);
  const key = np || email?.toLowerCase();
  if (!key) return json({ pinSet: false, sessionActive: false });
  const pinData = await env.CHECKINS.get(`pin:${key}`);
  return json({ pinSet: !!pinData, sessionActive: false });
}

async function handleSetPin(request, env) {
  const body = await request.json();
  const { phone, email, pin } = body;
  const np = normalizePhone(phone);
  const key = np || email?.toLowerCase();
  if (!key) return json({ error: "phone or email required" }, 400);
  const hash = await hashPin(pin, env.PIN_PEPPER);
  await env.CHECKINS.put(`pin:${key}`, JSON.stringify({ hash }));
  return json({ success: true });
}

async function handleVerifyPin(request, env) {
  const body = await request.json();
  const { phone, email, pin } = body;
  const np = normalizePhone(phone);
  const key = np || email?.toLowerCase();
  if (!key) return json({ error: "phone or email required" }, 400);
  const pinData = await env.CHECKINS.get(`pin:${key}`);
  if (!pinData) return json({ error: "no_pin_set" }, 404);
  const { hash } = JSON.parse(pinData);
  const inputHash = await hashPin(pin, env.PIN_PEPPER);
  if (inputHash !== hash) return json({ error: "invalid_pin" }, 401);
  const token = generateToken();
  await env.CHECKINS.put(
    `session:${token}`,
    JSON.stringify({ phone: np, email, createdAt: Date.now() }),
    { expirationTtl: 1800 }
  );
  return json({ token, singleUse: false });
}

async function handleQueueExport(request, env) {
  const adminKey = request.headers.get("X-Admin-Key");
  if (adminKey !== env.ADMIN_KEY) return json({ error: "Unauthorized" }, 401);
  const list = await env.CHECKINS.list({ prefix: "checkin:" });
  const checkins = [];
  for (const key of list.keys) {
    const val = await env.CHECKINS.get(key.name);
    if (val) checkins.push(JSON.parse(val));
  }
  return json({ checkins, count: checkins.length });
}

// ─── Main router ──────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    try {
      if (path === "/classes" && method === "GET")
        return json({ classes: CLASSES });

      if (path === "/lookup/member" && method === "GET")
        return handleMemberLookup(url, env);

      if (path === "/lookup/drop-in" && method === "GET")
        return handleDropInLookup(url, env);

      if (path === "/member-check-in" && method === "POST")
        return handleCheckIn(request, env);

      if (path === "/create-payment-intent" && method === "POST")
        return handlePaymentIntent(request, env);

      if (path === "/create-setup-intent" && method === "POST")
        return handleSetupIntent(request, env);

      if (path === "/get-payment-methods" && method === "POST")
        return handleGetPaymentMethods(request, env);

      if (path === "/auth/pin-status" && method === "POST")
        return handlePinStatus(request, env);

      if (path === "/auth/set-pin" && method === "POST")
        return handleSetPin(request, env);

      if (path === "/auth/verify-pin" && method === "POST")
        return handleVerifyPin(request, env);

      if (path === "/checkin-queue" && method === "GET")
        return handleQueueExport(request, env);

      return json({ error: "Not found" }, 404);
    } catch (err) {
      console.error("Worker error:", err);
      return json({ error: err.message }, 500);
    }
  },
};
