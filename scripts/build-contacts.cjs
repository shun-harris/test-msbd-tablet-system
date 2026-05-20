#!/usr/bin/env node
// build-contacts.cjs
// Reads GHL contacts CSV + Stripe active subscribers → outputs contacts-kv.json
// Usage: node scripts/build-contacts.cjs path/to/contacts.csv
// Then run: cd tablet-worker && node_modules\.bin\wrangler kv bulk put ..\scripts\contacts-kv.json --binding CONTACTS

const fs = require("fs");
const path = require("path");
const https = require("https");

const CSV_PATH = process.argv[2] || path.join(__dirname, "..", "..", "Desktop", "Export_Contacts_undefined_May_2026_6_49_PM.csv");
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const OUTPUT_PATH = path.join(__dirname, "contacts-kv.json");

function normalizePhone(phone) {
  if (!phone) return null;
  return String(phone).replace(/\D/g, "").slice(-10);
}

function parseCSV(content) {
  const lines = content.split(/\r?\n/).filter(Boolean);
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => (obj[h] = values[i] || ""));
    return obj;
  });
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function stripeRequest(path, method = "GET") {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.stripe.com",
      path,
      method,
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error("Invalid JSON from Stripe"));
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function getActiveMembers() {
  const memberPhones = new Set();
  const memberEmails = new Set();
  let startingAfter = null;
  let hasMore = true;
  let page = 0;

  console.log("📡 Fetching active Stripe subscriptions...");

  while (hasMore) {
    page++;
    let url = `/v1/subscriptions?status=active&limit=100&expand[]=data.customer`;
    if (startingAfter) url += `&starting_after=${startingAfter}`;

    const data = await stripeRequest(url);

    if (data.error) {
      console.error("Stripe error:", data.error.message);
      break;
    }

    for (const sub of data.data || []) {
      const cust = sub.customer;
      if (typeof cust === "object") {
        const phone = normalizePhone(cust.phone || cust.metadata?.phone);
        const email = (cust.email || "").toLowerCase();
        if (phone) memberPhones.add(phone);
        if (email) memberEmails.add(email);
      }
    }

    hasMore = data.has_more;
    if (data.data?.length > 0) {
      startingAfter = data.data[data.data.length - 1].id;
    } else {
      hasMore = false;
    }

    process.stdout.write(`\r  Page ${page}, found ${memberPhones.size} member phones so far...`);
  }

  console.log(`\n✅ Found ${memberPhones.size} member phones, ${memberEmails.size} member emails`);
  return { memberPhones, memberEmails };
}

async function main() {
  console.log(`📂 Reading contacts from: ${CSV_PATH}`);
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ CSV file not found: ${CSV_PATH}`);
    console.error("Usage: node scripts/build-contacts.cjs path/to/contacts.csv");
    process.exit(1);
  }

  const csvContent = fs.readFileSync(CSV_PATH, "utf-8");
  const contacts = parseCSV(csvContent);
  console.log(`✅ Loaded ${contacts.length} contacts from CSV`);

  const { memberPhones, memberEmails } = await getActiveMembers();

  const kvEntries = [];
  let memberCount = 0;
  let skipped = 0;

  for (const contact of contacts) {
    const firstName = contact["First Name"] || "";
    const lastName = contact["Last Name"] || "";
    const phone = contact["Phone"] || "";
    const email = contact["Email"] || "";

    const normalizedPhone = normalizePhone(phone);
    const normalizedEmail = email.toLowerCase();

    if (!normalizedPhone && !normalizedEmail) {
      skipped++;
      continue;
    }

    const isMember =
      (normalizedPhone && memberPhones.has(normalizedPhone)) ||
      (normalizedEmail && memberEmails.has(normalizedEmail));

    if (isMember) memberCount++;

    const data = JSON.stringify({
      firstName,
      lastName,
      email,
      phone,
      isMember,
      contactType: isMember ? "member" : "contact",
      classesTaken: 0,
    });

    if (normalizedPhone) {
      kvEntries.push({ key: `phone:${normalizedPhone}`, value: data });
    }
    if (normalizedEmail) {
      kvEntries.push({ key: `email:${normalizedEmail}`, value: data });
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(kvEntries, null, 2));

  console.log(`\n🎉 Done!`);
  console.log(`   Total contacts: ${contacts.length}`);
  console.log(`   Members found: ${memberCount}`);
  console.log(`   KV entries written: ${kvEntries.length}`);
  console.log(`   Skipped (no phone/email): ${skipped}`);
  console.log(`   Output: ${OUTPUT_PATH}`);
  console.log(`\nNext step:`);
  console.log(`   cd "tablet-worker"`);
  console.log(`   node_modules\\.bin\\wrangler kv bulk put ..\\scripts\\contacts-kv.json --binding CONTACTS`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
