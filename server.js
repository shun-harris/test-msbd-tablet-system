require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();

// ================= Environment Detection & Logging =================
function detectEnvironment(req){
    const forwarded = (req.headers['x-forwarded-host'] || '').toLowerCase();
    const host = (forwarded || req.get('host') || '').toLowerCase();
    const rawHost = host || 'unknown-host';

    // 1. Explicit override via env variable (highest priority)
    const OVERRIDE = (process.env.APP_ENV || '').toLowerCase();
    if (OVERRIDE === 'production' || OVERRIDE === 'prod') return { env:'production', reason:'APP_ENV override', host:rawHost, forwarded }; 
    if (OVERRIDE === 'test' || OVERRIDE === 'staging') return { env:'test', reason:'APP_ENV override', host:rawHost, forwarded }; 

    // 2. Custom domains
    if (rawHost === 'tablet.msbdance.com') return { env:'production', reason:'custom domain match', host:rawHost, forwarded };
    if (rawHost === 'test.tablet.msbdance.com') return { env:'test', reason:'test subdomain match', host:rawHost, forwarded };

    // 3. Railway provided domain patterns
    // Examples:
    //   test-msbd-tablet-system-production.up.railway.app  (test)
    //   prod-msbd-tablet-system-production.up.railway.app  (production)
    //   msbd-tablet-system-production.up.railway.app       (legacy/alt prod)
    if (/test-msbd-tablet-system.*\.up\.railway\.app$/.test(rawHost)) return { env:'test', reason:'railway test pattern', host:rawHost, forwarded };
    if (/(prod-)?msbd-tablet-system.*\.up\.railway\.app$/.test(rawHost)) return { env:'production', reason:'railway production pattern', host:rawHost, forwarded };

    // 4. Local / fallback
    if (/^(localhost|127\.0\.0\.1|::1)(:\d+)?$/.test(rawHost)) return { env:'local', reason:'localhost host', host:rawHost, forwarded };
    return { env:'local', reason:'default fallback', host:rawHost, forwarded };
}

function getStripeForRequest(req){
    const det = detectEnvironment(req);
    const environment = det.env;
    const stripeKey = environment === 'production' ? process.env.STRIPE_LIVE_KEY : process.env.STRIPE_TEST_KEY;

    console.log(`\n🌐  Environment Detection`);
    console.log(`   ├─ host: ${det.host}`);
    console.log(`   ├─ x-forwarded-host: ${det.forwarded || '∅'}`);
    console.log(`   ├─ chosen env: ${environment}`);
    console.log(`   ├─ reason: ${det.reason}`);
    console.log(`   └─ stripe key family: ${environment === 'production' ? 'LIVE' : 'TEST'}`);

    if (environment === 'production' && !process.env.STRIPE_LIVE_KEY) {
        console.error('❌ Missing STRIPE_LIVE_KEY for production');
    }
    if (environment !== 'production' && !process.env.STRIPE_TEST_KEY) {
        console.error('❌ Missing STRIPE_TEST_KEY for test/local');
    }

    return { stripe: require('stripe')(stripeKey), environment, detection: det };
}

const app = express();
const PORT = process.env.PORT || 3000;

// ================= PIN / SESSION STORAGE (SQLite) =================
// Lightweight credential store for PINs (phone or email keyed) with lockouts
const PIN_DB_FILE = process.env.PIN_DB_FILE || './pin_store.sqlite';
const PIN_PEPPER = process.env.PIN_PEPPER || 'PLEASE_SET_PIN_PEPPER';
const PIN_BCRYPT_COST = parseInt(process.env.PIN_BCRYPT_COST || '11',10);
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const VERIFY_WINDOW_MS = 5 * 60 * 1000; // 5 min rolling window
const VERIFY_MAX_WINDOW_ATTEMPTS = 15; // verify calls in window
const PIN_ADMIN_KEY = process.env.PIN_ADMIN_KEY || 'PLEASE_SET_ADMIN_KEY';

console.log(`🔐 PIN Database: ${PIN_DB_FILE}`);
if (PIN_DB_FILE.startsWith('/data/')) {
    console.log('✅ Using persistent volume for PIN storage (survives deployments)');
} else {
    console.warn('⚠️  Using local filesystem for PIN storage (will be lost on deployment!)');
}

const db = new sqlite3.Database(PIN_DB_FILE);
db.serialize(()=>{
    db.run(`CREATE TABLE IF NOT EXISTS pin_credentials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT,
        email TEXT,
        stripe_customer_id TEXT,
        pin_hash TEXT,
        attempts INTEGER DEFAULT 0,
        locked_until INTEGER,
        created_at INTEGER DEFAULT(strftime('%s','now')),
        updated_at INTEGER DEFAULT(strftime('%s','now')),
        UNIQUE(phone),
        UNIQUE(email)
    );`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_pin_phone ON pin_credentials(phone);`);
});

// In-memory session map (token -> { phone, email, expiresAt })
const sessions = new Map();
function createSession(identity, { singleUse=false } = {}){
    const token = crypto.randomBytes(16).toString('hex');
    sessions.set(token,{ ...identity, singleUse, used:false, expiresAt: Date.now()+SESSION_TTL_MS });
    return token;
}
function getSession(token){
    if(!token) return null;
    const s = sessions.get(token);
    if(!s) return null;
    if(s.expiresAt < Date.now()){ sessions.delete(token); return null; }
    return s;
}
setInterval(()=>{ // GC expired sessions
    const now = Date.now();
    for(const [k,v] of sessions.entries()) if(v.expiresAt < now) sessions.delete(k);
}, 5*60*1000).unref();

function normalizePhone(raw){
    if(!raw) return null; return raw.replace(/\D/g,'').slice(-10); // naive US local style
}
function credentialLookup(phone,email){
    return new Promise((resolve,reject)=>{
        if(phone){
            db.get('SELECT * FROM pin_credentials WHERE phone = ? LIMIT 1',[phone],(e,row)=>{
                if(e) return reject(e); if(row) return resolve(row);
                if(email){
                    db.get('SELECT * FROM pin_credentials WHERE email = ? LIMIT 1',[email],(e2,row2)=>{ if(e2) return reject(e2); resolve(row2||null); });
                } else resolve(null);
            });
        } else if(email){
            db.get('SELECT * FROM pin_credentials WHERE email = ? LIMIT 1',[email],(e,row)=>{ if(e) return reject(e); resolve(row||null); });
        } else resolve(null);
    });
}
function upsertPinRow({phone,email,hash,stripe_customer_id}){
    return new Promise((resolve,reject)=>{
        const now = Math.floor(Date.now()/1000);
        const ph = phone || null;
        const em = email || null;
        db.run(`INSERT INTO pin_credentials(phone,email,stripe_customer_id,pin_hash,attempts,locked_until,created_at,updated_at)
            VALUES(?,?,?,?,0,NULL,?,?)
            ON CONFLICT(phone) DO UPDATE SET pin_hash=excluded.pin_hash, attempts=0, locked_until=NULL, updated_at=excluded.updated_at`,
            [ph,em,stripe_customer_id||null,hash,now,now],(e)=>{ if(e) return reject(e); resolve(); });
    });
}
function recordFailedAttempt(row){
    return new Promise((resolve,reject)=>{
        const attempts = (row.attempts||0)+1;
        let locked_until = row.locked_until || null;
        if(attempts >= MAX_ATTEMPTS){
            locked_until = Date.now() + LOCKOUT_MINUTES*60*1000;
        }
        db.run('UPDATE pin_credentials SET attempts=?, locked_until=?, updated_at=? WHERE id=?',[attempts, locked_until?Math.floor(locked_until):null, Math.floor(Date.now()/1000), row.id],(e)=>{
            if(e) return reject(e); resolve({ attempts, locked_until });
        });
    });
}
function clearFailures(row){
    return new Promise((resolve,reject)=>{
        db.run('UPDATE pin_credentials SET attempts=0, locked_until=NULL, updated_at=? WHERE id=?',[Math.floor(Date.now()/1000), row.id],(e)=>{ if(e) return reject(e); resolve(); });
    });
}

// Middleware to require valid PIN session for sensitive routes
function requirePinSession(req,res,next){
    const auth = (req.get('authorization')||'').trim();
    if(!auth.startsWith('Bearer ')) return res.status(401).json({ error:'missing_session' });
    const token = auth.slice(7);
    const sess = getSession(token);
    if(!sess) return res.status(401).json({ error:'invalid_or_expired' });
    if(sess.singleUse && sess.used){
        sessions.delete(token);
        return res.status(401).json({ error:'consumed' });
    }
    req.pinSession = sess;
    req.pinSessionToken = token;
    next();
}

// Simple in-memory rate limiting of verify attempts (separate from lockout)
const verifyRateLog = new Map(); // key -> [timestamps]
function rateLimitCheck(key){
    if(!key) return { allowed:true };
    const now = Date.now();
    let arr = verifyRateLog.get(key) || [];
    arr = arr.filter(ts => now - ts < VERIFY_WINDOW_MS);
    if(arr.length >= VERIFY_MAX_WINDOW_ATTEMPTS){
        const retryIn = VERIFY_WINDOW_MS - (now - arr[0]);
        return { allowed:false, retryAfterMs: retryIn };
    }
    arr.push(now);
    verifyRateLog.set(key, arr);
    return { allowed:true };
}

// Load version metadata once at startup (graceful fallback if missing)
let VERSION_INFO = { version: '0.0.0', buildDate: null };
try {
    const fs = require('fs');
    if (fs.existsSync(__dirname + '/version.json')) {
        VERSION_INFO = JSON.parse(fs.readFileSync(__dirname + '/version.json','utf8'));
    }
} catch (e) {
    console.warn('⚠ Could not read version.json:', e.message);
}

// CORS configuration (explicit whitelist so we can safely allow localhost + test hitting prod API)
const ALLOWED_ORIGINS = [
    'https://tablet.msbdance.com',
    'https://test.tablet.msbdance.com',
    'http://localhost',
    'http://127.0.0.1'
];

function originAllowed(origin) {
    if (!origin) return true; // Non-browser or file:// loads
    // Allow any localhost port
    if (/^http:\/\/localhost(:\d+)?$/i.test(origin)) return true;
    if (/^http:\/\/127\.0\.0\.1(:\d+)?$/i.test(origin)) return true;
    return ALLOWED_ORIGINS.includes(origin);
}

app.use(cors({
    origin: (origin, callback) => {
        if (originAllowed(origin)) {
            if (origin) console.log(`✅ CORS allow: ${origin}`);
            return callback(null, true);
        }
        console.warn(`🚫 CORS block: ${origin}`);
        return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET','POST','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization'],
    optionsSuccessStatus: 200
}));

// Handle preflight early (optional explicit)
app.options('*', (req,res)=>{
    res.sendStatus(200);
});
app.use(express.json());
app.use(express.static("."));

// Request logging
app.use((req, res, next) => {
    console.log(`📝 ${req.method} ${req.path} from ${req.get('host')}`);
    next();
});

// Routes
app.get("/", (req, res) => res.sendFile(__dirname + "/index.html"));
app.get("/options", (req, res) => res.sendFile(__dirname + "/options.html"));

// Environment test endpoint
app.get("/test/environment", (req, res) => {
    const det = detectEnvironment(req);
    const usingLiveKeys = det.env === 'production';
    res.json({
        host: det.host,
        forwardedHost: det.forwarded || null,
        environment: det.env,
        determination: det.reason,
        stripe_keys: usingLiveKeys ? 'LIVE' : 'TEST',
        timestamp: new Date().toISOString(),
        version: 'v' + (VERSION_INFO.version || '0.0.0')
    });
});

// Stripe payment endpoint
app.post("/create-payment-intent", async (req, res) => {
    console.log("💰 Payment intent request received:", req.body);
    try {
    const { stripe, environment, detection } = getStripeForRequest(req);
        const { amount, currency = "usd", description = "Dance class payment", payment_method_id } = req.body;
        
        console.log(`💳 Creating payment intent: $${amount} ${currency}`);
        
        // Create or find customer by phone number
        const { phone, name, email } = req.body;
        let customer;
        
        // Try to find existing customer by email first (most reliable), then phone
        if (email && !email.includes('@tablet.msbdance.com')) {
            console.log(`🔍 Searching for customer by email: ${email}`);
            let existingCustomers = await stripe.customers.search({
                query: `email:'${email}'`,
                limit: 1
            });
            
            if (existingCustomers.data.length > 0) {
                customer = existingCustomers.data[0];
                console.log(`👤 Found existing customer by email: ${customer.id}`);
                
                // Update phone if provided and different
                if (phone && customer.phone !== phone) {
                    console.log(`📱 Updating customer phone: ${phone}`);
                    customer = await stripe.customers.update(customer.id, {
                        phone: phone,
                        name: name || customer.name,
                        metadata: { ...customer.metadata, phone: phone }
                    });
                }
            }
        }
        
        // If not found by email and we have phone, try phone lookup
        if (!customer && phone) {
            console.log(`🔍 Searching for customer by phone: ${phone}`);
            // Try multiple ways to find existing customer
            let existingCustomers = await stripe.customers.search({
                query: `metadata['phone']:'${phone}'`,
                limit: 1
            });
            
            // If not found in metadata, try phone field directly
            if (existingCustomers.data.length === 0) {
                existingCustomers = await stripe.customers.search({
                    query: `phone:'${phone}'`,
                    limit: 1
                });
            }
            
            if (existingCustomers.data.length > 0) {
                customer = existingCustomers.data[0];
                console.log(`👤 Found existing customer by phone: ${customer.id}`);
                
                // Update customer with real email if provided and different
                if (email && email !== customer.email && !email.includes('@tablet.msbdance.com')) {
                    console.log(`📧 Updating customer email from webhook: ${email}`);
                    customer = await stripe.customers.update(customer.id, {
                        email: email,
                        name: name || customer.name
                    });
                }
                
                // Ensure phone is in metadata for future lookups
                if (!customer.metadata.phone) {
                    console.log(`🔧 Adding phone to customer metadata for future lookups`);
                    await stripe.customers.update(customer.id, {
                        metadata: { ...customer.metadata, phone: phone }
                    });
                }
            }
        }
        
        // Create new customer if not found
        if (!customer) {
            // Create new customer with real email if available
            const customerData = {
                phone: phone,
                name: name || 'Dance Student',
                email: email || `${phone}@tablet.msbdance.com`,
                metadata: { 
                    source: 'tablet_system', 
                    phone: phone,
                    created_via: email ? 'webhook_with_email' : 'tablet_fallback'
                }
            };
            
            customer = await stripe.customers.create(customerData);
            console.log(`👤 Created new customer: ${customer.id} for phone ${phone}${email ? ` with email ${email}` : ' with fallback email'}`);
        }

        const paymentIntentData = {
            amount: Math.round(amount * 100),
            currency,
            description,
            confirmation_method: 'manual',
            confirm: true,
            // Explicitly restrict to card only to disable Link / other wallets
            payment_method_types: ['card'],
            // Do NOT enable automatic_payment_methods (would re-enable Link/ApplePay etc.)
            return_url: `${req.protocol}://${req.get('host')}/options`,
        };

        // Add customer to payment intent
        if (customer) {
            paymentIntentData.customer = customer.id;
        }

        // Handle saved payment method (requires PIN session)
        if (payment_method_id) {
            const auth = (req.get('authorization')||'').trim();
            const token = auth.startsWith('Bearer ')? auth.slice(7): null;
            const sess = getSession(token);
            if(!sess){
                return res.status(401).json({ error:'pin_session_required' });
            }
            // Mark single-use session as consumed
            if(sess.singleUse){ sess.used = true; }
            paymentIntentData.payment_method = payment_method_id;
            console.log(`🎯 Using saved payment method (authorized): ${payment_method_id}`);
        } else if (req.body.new_payment_method) {
            // Handle NEW payment method (no PIN required)
            paymentIntentData.payment_method = req.body.new_payment_method;
            paymentIntentData.setup_future_usage = 'on_session'; // Save for future
            console.log(`💳 Using new payment method (no PIN required): ${req.body.new_payment_method}`);
        } else {
            // For new cards without pre-saved method, save them automatically after payment
            paymentIntentData.setup_future_usage = 'on_session';
            console.log(`💾 Will save new payment method for future use`);
        }

        const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

        console.log("✅ Payment intent created successfully:", paymentIntent.id);
        console.log("📊 Payment status:", paymentIntent.status);

        res.send({
            clientSecret: paymentIntent.client_secret,
            environment: environment,
            status: paymentIntent.status
        });
    } catch (error) {
        console.error("Payment error:", error);
        res.status(500).send({ error: error.message });
    }
});

// Get payment methods endpoint
app.post("/get-payment-methods", async (req, res) => {
    console.log("💳 Get payment methods request:", req.body);
    try {
    const { stripe, environment, detection } = getStripeForRequest(req);
        const phone = normalizePhone(req.body.phone);
        const { email } = req.body;
        const auth = (req.get('authorization')||'').trim();
        const token = auth.startsWith('Bearer ')? auth.slice(7): null;
        const sess = getSession(token);
        if(!sess){
            return res.status(401).json({ error:'pin_session_required' });
        }
        // Mark single-use session as consumed on card listing as an extra security measure
        if(sess.singleUse && !sess.used){
            sess.used = true;
            console.log(`🔐 Consumed single-use PIN session on card list for identity phone=${sess.phone||'∅'} email=${sess.email||'∅'}`);
        }
        
        if (!phone && !email) {
            return res.json({ payment_methods: [] });
        }
        
        // Try to find customer by email first (most reliable), then phone
        let customer = null;
        
        if (email && !email.includes('@tablet.msbdance.com')) {
            console.log(`🔍 [search] email primary lookup: ${email}`);
            const emailCustomers = await stripe.customers.search({
                query: `email:'${email}'`,
                limit: 1
            });
            
            if (emailCustomers.data.length > 0) {
                customer = emailCustomers.data[0];
                console.log(`👤 Found customer ${customer.id} via email`);
            }
        }
        
        // If not found by email and we have phone, try phone lookup
        if (!customer && phone) {
            console.log(`🔍 [search] phone path for: ${phone}`);
            
            // Method 1: Search by phone in metadata (tablet system)
            console.log(`   → attempt metadata['phone'] search`);
            const metadataCustomers = await stripe.customers.search({
                query: `metadata['phone']:'${phone}'`,
                limit: 1
            });
        
        if (metadataCustomers.data.length > 0) {
            customer = metadataCustomers.data[0];
            console.log(`✅ [search] metadata match: ${customer.id}`);
        } else {
            console.log(`   → attempt phone field search`);
            const phoneCustomers = await stripe.customers.search({
                query: `phone:'${phone}'`,
                limit: 1
            });
            
            if (phoneCustomers.data.length > 0) {
                customer = phoneCustomers.data[0];
                console.log(`✅ [search] phone field match: ${customer.id}`);
            }
        }
        }
        
        if (!customer) {
            const searchBy = email && !email.includes('@tablet.msbdance.com') ? `email ${email}` : `phone ${phone}`;
            console.log(`📱 No customer found for ${searchBy}`);
            return res.json({ payment_methods: [] });
        }
        console.log(`👤 Found customer ${customer.id}`);
        
        // Get saved payment methods for this customer
        const paymentMethods = await stripe.paymentMethods.list({
            customer: customer.id,
            type: 'card',
        });
        
        console.log(`💳 Found ${paymentMethods.data.length} saved cards`);
        
        // Format the payment methods for frontend
        const formattedMethods = paymentMethods.data.map(pm => ({
            id: pm.id,
            last4: pm.card.last4,
            brand: pm.card.brand,
            exp_month: pm.card.exp_month,
            exp_year: pm.card.exp_year
        }));
        
        res.json({ payment_methods: formattedMethods });
    } catch (error) {
        console.error("Get payment methods error:", error);
        res.status(500).send({ error: error.message });
    }
});

// Delete payment method endpoint (PIN session required)
app.post("/delete-payment-method", async (req, res) => {
    console.log("🗑️ Delete payment method request:", req.body);
    try {
        const { stripe, environment, detection } = getStripeForRequest(req);
        const phone = normalizePhone(req.body.phone);
        const { email, payment_method_id } = req.body;
        
        // Verify PIN session
        const auth = (req.get('authorization')||'').trim();
        const token = auth.startsWith('Bearer ')? auth.slice(7): null;
        const sess = getSession(token);
        if(!sess){
            return res.status(401).json({ error:'pin_session_required' });
        }
        
        if (!payment_method_id) {
            return res.status(400).json({ error: 'payment_method_id required' });
        }
        
        // Find customer
        let customer = null;
        if (email && !email.includes('@tablet.msbdance.com')) {
            const emailCustomers = await stripe.customers.search({
                query: `email:'${email}'`,
                limit: 1
            });
            if (emailCustomers.data.length > 0) {
                customer = emailCustomers.data[0];
            }
        }
        
        if (!customer && phone) {
            const metadataCustomers = await stripe.customers.search({
                query: `metadata['phone']:'${phone}'`,
                limit: 1
            });
            if (metadataCustomers.data.length > 0) {
                customer = metadataCustomers.data[0];
            } else {
                const phoneCustomers = await stripe.customers.search({
                    query: `phone:'${phone}'`,
                    limit: 1
                });
                if (phoneCustomers.data.length > 0) {
                    customer = phoneCustomers.data[0];
                }
            }
        }
        
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        
        // Check card count before deleting
        const paymentMethods = await stripe.paymentMethods.list({
            customer: customer.id,
            type: 'card',
        });
        
        if (paymentMethods.data.length <= 1) {
            return res.status(400).json({ 
                error: 'minimum_card_required',
                message: 'You must have at least one active card on file'
            });
        }
        
        // Detach payment method
        await stripe.paymentMethods.detach(payment_method_id);
        console.log(`✅ Detached payment method ${payment_method_id} from customer ${customer.id}`);
        
        res.json({ success: true });
    } catch (error) {
        console.error("Delete payment method error:", error);
        res.status(500).send({ error: error.message });
    }
});

// Add payment method with $20 test transaction (PIN session required)
app.post("/add-payment-method", async (req, res) => {
    console.log("➕ Add payment method with test transaction:", req.body);
    const { stripe, environment, detection } = getStripeForRequest(req); // Move stripe out of try block for catch access
    try {
        const phone = normalizePhone(req.body.phone);
        const { email, payment_method_id, name } = req.body; // Add name to destructuring
        
        // Verify PIN session
        const auth = (req.get('authorization')||'').trim();
        const token = auth.startsWith('Bearer ')? auth.slice(7): null;
        const sess = getSession(token);
        if(!sess){
            return res.status(401).json({ error:'pin_session_required' });
        }
        
        if (!payment_method_id) {
            return res.status(400).json({ error: 'payment_method_id required' });
        }
        
        // Find or create customer
        let customer = null;
        if (email && !email.includes('@tablet.msbdance.com')) {
            const emailCustomers = await stripe.customers.search({
                query: `email:'${email}'`,
                limit: 1
            });
            if (emailCustomers.data.length > 0) {
                customer = emailCustomers.data[0];
            }
        }
        
        if (!customer && phone) {
            const metadataCustomers = await stripe.customers.search({
                query: `metadata['phone']:'${phone}'`,
                limit: 1
            });
            if (metadataCustomers.data.length > 0) {
                customer = metadataCustomers.data[0];
            } else {
                const phoneCustomers = await stripe.customers.search({
                    query: `phone:'${phone}'`,
                    limit: 1
                });
                if (phoneCustomers.data.length > 0) {
                    customer = phoneCustomers.data[0];
                }
            }
        }
        
        // Create customer if not found
        if (!customer) {
            customer = await stripe.customers.create({
                phone: phone,
                name: name || 'Dance Student',
                email: email || `${phone}@tablet.msbdance.com`,
                metadata: { 
                    source: 'tablet_system', 
                    phone: phone 
                }
            });
            console.log(`👤 Created new customer: ${customer.id} (phone: ${phone}, name: ${name || 'Dance Student'}, email: ${email || 'fallback'})`);
        }
        
        // Attach payment method to customer first
        await stripe.paymentMethods.attach(payment_method_id, {
            customer: customer.id,
        });
        console.log(`📎 Attached payment method ${payment_method_id} to customer ${customer.id}`);
        
        // Create $20 test payment intent to verify card has funds
        const testAmount = 2000; // $20.00 in cents
        console.log(`🧪 Creating $20 test charge to verify card...`);
        
        const paymentIntent = await stripe.paymentIntents.create({
            amount: testAmount,
            currency: 'usd',
            customer: customer.id,
            payment_method: payment_method_id,
            off_session: true,
            confirm: true,
            description: 'Card verification hold - will be refunded',
            metadata: {
                type: 'card_verification',
                phone: phone || '',
                email: email || ''
            }
        });
        
        if (paymentIntent.status === 'succeeded') {
            console.log(`✅ Test charge succeeded, immediately refunding...`);
            
            // Immediately refund the test charge
            const refund = await stripe.refunds.create({
                payment_intent: paymentIntent.id,
                reason: 'requested_by_customer'
            });
            
            console.log(`💰 Refund issued: ${refund.id} (status: ${refund.status})`);
            
            res.json({ 
                success: true,
                message: 'Card verified successfully. $20 test charge has been refunded.',
                payment_method_id: payment_method_id
            });
        } else {
            // If charge didn't succeed, detach the card
            await stripe.paymentMethods.detach(payment_method_id);
            console.log(`❌ Test charge failed (${paymentIntent.status}), detached card`);
            
            res.status(400).json({ 
                error: 'card_verification_failed',
                message: 'Card verification failed. Please ensure the card has at least $20 available.',
                status: paymentIntent.status
            });
        }
    } catch (error) {
        console.error("Add payment method error:", error);
        
        // Try to detach the payment method if it was attached
        if (req.body.payment_method_id) {
            try {
                await stripe.paymentMethods.detach(req.body.payment_method_id);
                console.log(`🧹 Cleaned up payment method after error`);
            } catch (detachError) {
                console.error("Error detaching payment method:", detachError);
            }
        }
        
        // Provide user-friendly error messages
        let errorMessage = 'Unable to verify card. Please check your card details and try again.';
        if (error.code === 'card_declined') {
            errorMessage = 'Card was declined. Please ensure the card has at least $20 available and try again.';
        } else if (error.code === 'insufficient_funds') {
            errorMessage = 'Insufficient funds. Please ensure the card has at least $20 available.';
        } else if (error.type === 'StripeCardError') {
            errorMessage = error.message;
        }
        
        res.status(400).json({ 
            error: 'card_verification_failed',
            message: errorMessage,
            details: error.message
        });
    }
});

// Create setup intent for saving payment methods
app.post("/create-setup-intent", async (req, res) => {
    console.log("💾 Setup intent request received:", req.body);
    try {
        const { stripe, environment, detection } = getStripeForRequest(req);
        const { phone, name, email } = req.body;
        
        // Create or get customer
        const customer = await stripe.customers.create({
            phone: phone,
            name: name,
            email: email || `${phone}@tablet.msbdance.com`,
            metadata: { source: 'tablet_system' }
        });
        
        console.log("👤 Customer created:", customer.id);
        
        const setupIntent = await stripe.setupIntents.create({
            customer: customer.id,
            // Restrict to card only; omit automatic_payment_methods to prevent Link
            payment_method_types: ['card']
        });
        
        console.log("✅ Setup intent created:", setupIntent.id);

        res.send({
            client_secret: setupIntent.client_secret,
            customer_id: customer.id,
            environment: environment
        });
    } catch (error) {
        console.error("Setup intent error:", error);
        res.status(500).send({ error: error.message });
    }
});

// Health check
app.get("/health", (req, res) => {
    const det = detectEnvironment(req);
    res.json({
        status: 'ok',
        host: det.host,
        forwardedHost: det.forwarded || null,
        environment: det.env,
        reason: det.reason,
        stripe: det.env === 'production' ? 'LIVE MODE' : 'TEST MODE',
        version: VERSION_INFO.version,
        buildDate: VERSION_INFO.buildDate || null
    });
});

// ================= PIN AUTH ENDPOINTS =================
// POST /auth/pin-status { phone, email }
// Returns: { pinSet: boolean, locked: boolean, lockedMinutesRemaining?: n, attempts?: n, sessionActive?: bool }
app.post('/auth/pin-status', async (req,res)=>{
    try {
        const phone = normalizePhone(req.body.phone||'');
        const email = (req.body.email||'').trim().toLowerCase();
        const row = await credentialLookup(phone,email);
        const auth = (req.get('authorization')||'').trim();
        const token = auth.startsWith('Bearer ')? auth.slice(7): null;
        const sess = getSession(token);
        let locked=false, lockedMinutesRemaining=0;
        if(row && row.locked_until){
            if(row.locked_until > Date.now()){
                locked=true; lockedMinutesRemaining = Math.ceil((row.locked_until - Date.now())/60000);
            }
        }
        const attempts = row?row.attempts:0;
        const attemptsRemaining = MAX_ATTEMPTS - attempts;
        res.json({ pinSet: !!(row && row.pin_hash), locked, lockedMinutesRemaining, attempts, attemptsRemaining, maxAttempts: MAX_ATTEMPTS, sessionActive: !!sess });
    } catch(e){
        console.error('PIN status error', e); res.status(500).json({ error:'pin_status_failed' });
    }
});

// POST /auth/set-pin { phone,email,pin }
app.post('/auth/set-pin', async (req,res)=>{
    try {
        const phone = normalizePhone(req.body.phone||'');
        const email = (req.body.email||'').trim().toLowerCase();
        const pin = (req.body.pin||'').trim();
        if(!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error:'invalid_pin_format' });
        const existing = await credentialLookup(phone,email);
        if(existing && existing.pin_hash){
            return res.status(409).json({ error:'already_set' });
        }
        if(PIN_PEPPER === 'PLEASE_SET_PIN_PEPPER'){
            console.warn('⚠ Using default PIN_PEPPER; set environment variable for security.');
        }
        const hash = await bcrypt.hash(pin + PIN_PEPPER, PIN_BCRYPT_COST);
        console.log(`[PIN][set] upserting pin row phone=${phone||'∅'} email=${email||'∅'}`);
        await upsertPinRow({ phone, email, hash });
        console.log('[PIN][set] success');
        const token = createSession({ phone, email }, { singleUse:true });
        res.json({ ok:true, sessionToken: token, expiresInMs: SESSION_TTL_MS, attemptsRemaining: MAX_ATTEMPTS, maxAttempts: MAX_ATTEMPTS });
    } catch(e){
        const msg = (e && e.message)||String(e);
        console.error('Set PIN error', msg);
        if(/SQLITE_CONSTRAINT/.test(msg)){
            return res.status(409).json({ error:'constraint_conflict' });
        }
        res.status(500).json({ error:'set_pin_failed', detail: process.env.NODE_ENV==='development'? msg: undefined });
    }
});

// POST /auth/verify-pin { phone,email,pin }
app.post('/auth/verify-pin', async (req,res)=>{
    try {
        const phone = normalizePhone(req.body.phone||'');
        const email = (req.body.email||'').trim().toLowerCase();
        const pin = (req.body.pin||'').trim();
        const rlKey = phone || email;
        const rl = rateLimitCheck(rlKey);
        if(!rl.allowed){
            return res.status(429).json({ error:'rate_limited', retryAfterSeconds: Math.ceil(rl.retryAfterMs/1000) });
        }
        const row = await credentialLookup(phone,email);
        if(!row || !row.pin_hash) return res.status(404).json({ error:'not_set' });
        if(row.locked_until && row.locked_until > Date.now()){
            return res.status(423).json({ error:'locked', lockedUntil: row.locked_until });
        }
        const ok = await bcrypt.compare(pin + PIN_PEPPER, row.pin_hash);
        if(!ok){
            const { attempts, locked_until } = await recordFailedAttempt(row);
            const locked = !!(locked_until && locked_until > Date.now());
            const attemptsRemaining = Math.max(0, MAX_ATTEMPTS - attempts);
            return res.status(401).json({ error: locked? 'locked':'bad_pin', attempts, attemptsRemaining, maxAttempts: MAX_ATTEMPTS, locked, lockedUntil: locked_until||null });
        }
        await clearFailures(row);
        const token = createSession({ phone: row.phone, email: row.email }, { singleUse:true });
        res.json({ ok:true, sessionToken: token, expiresInMs: SESSION_TTL_MS, attemptsRemaining: MAX_ATTEMPTS, maxAttempts: MAX_ATTEMPTS });
    } catch(e){
        console.error('Verify PIN error', e); res.status(500).json({ error:'verify_pin_failed' });
    }
});

// Admin reset PIN endpoint (on-device with admin key)
// POST /auth/reset-pin { phone?, email?, adminKey }
app.post('/auth/reset-pin', async (req,res)=>{
    try {
        const { phone:rawPhone, email:rawEmail, adminKey } = req.body || {};
        if(!adminKey || adminKey !== PIN_ADMIN_KEY){
            return res.status(403).json({ error:'forbidden' });
        }
        const phone = normalizePhone(rawPhone||'');
        const email = (rawEmail||'').trim().toLowerCase();
        const row = await credentialLookup(phone,email);
        if(!row){
            return res.status(404).json({ error:'not_found' });
        }
        db.run('UPDATE pin_credentials SET pin_hash=NULL, attempts=0, locked_until=NULL, updated_at=? WHERE id=?',[Math.floor(Date.now()/1000), row.id], (e)=>{
            if(e){ console.error('Reset PIN update error', e); return res.status(500).json({ error:'reset_failed' }); }
            res.json({ ok:true });
        });
    } catch(e){
        console.error('Reset PIN error', e); res.status(500).json({ error:'reset_pin_failed' });
    }
});

// Lightweight debug endpoint (development / troubleshooting only)
// POST /auth/pin-debug { phone, email, adminKey? }
// Returns minimal state (no hashes) to help diagnose why set-pin failed.
app.post('/auth/pin-debug', async (req,res)=>{
    try {
        const phone = normalizePhone(req.body.phone||'');
        const email = (req.body.email||'').trim().toLowerCase();
        const adminKey = req.body.adminKey || null;
        // If an admin key is set in env, require it to avoid leaking lockout data broadly.
        if(PIN_ADMIN_KEY && PIN_ADMIN_KEY !== 'PLEASE_SET_ADMIN_KEY'){
            if(adminKey !== PIN_ADMIN_KEY){
                return res.status(403).json({ error:'forbidden' });
            }
        }
        const row = await credentialLookup(phone,email);
        if(!row){
            return res.json({ exists:false });
        }
        let locked=false, lockedMinutesRemaining=0;
        if(row.locked_until && row.locked_until > Date.now()){
            locked=true; lockedMinutesRemaining = Math.ceil((row.locked_until - Date.now())/60000);
        }
        res.json({
            exists:true,
            phone: row.phone || null,
            email: row.email || null,
            pinSet: !!row.pin_hash,
            attempts: row.attempts,
            locked,
            lockedMinutesRemaining
        });
    } catch(e){
        console.error('PIN debug error', e.message||e);
        res.status(500).json({ error:'debug_failed' });
    }
});

// Placeholder: Protected route example (not yet wired to front-end). Use requirePinSession for future saved-card actions.
app.get('/auth/session-check', requirePinSession, (req,res)=>{
    res.json({ ok:true, identity: req.pinSession, expiresAt: req.pinSession.expiresAt });
});

// Explicit revoke endpoint (called on cancel/back/payment success) to force re-entry next time
// Admin PIN reset - requires admin key to reset a customer's PIN
app.post('/auth/admin-reset-pin', (req,res)=>{
    const { phone, email, adminKey } = req.body;
    const identifier = phone || email;
    if(!identifier) return res.status(400).json({ ok:false, error:'phone or email required' });
    if(!adminKey) return res.status(400).json({ ok:false, error:'adminKey required' });
    
    // Validate admin key
    if(adminKey !== PIN_ADMIN_KEY){
        console.log(`❌ [ADMIN RESET] Invalid admin key attempt for ${identifier}`);
        return res.status(403).json({ ok:false, error:'Invalid admin key' });
    }
    
    // Reset the PIN by deleting the credential row
    // Use phone OR email column depending on which is provided
    const whereClause = phone ? 'phone=?' : 'email=?';
    const whereValue = phone || email;
    
    db.run(`DELETE FROM pin_credentials WHERE ${whereClause}`, [whereValue], function(err){
        if(err){
            console.error('❌ [ADMIN RESET] Database error:', err);
            return res.status(500).json({ ok:false, error:'Database error' });
        }
        console.log(`✅ [ADMIN RESET] PIN reset for ${identifier} (rows affected: ${this.changes})`);
        res.json({ ok:true, message:'PIN reset successfully', rowsAffected: this.changes });
    });
});

app.post('/auth/revoke-session', (req,res)=>{
    const auth = (req.get('authorization')||'').trim();
    if(auth.startsWith('Bearer ')){
        const token = auth.slice(7);
        if(sessions.has(token)) sessions.delete(token);
    }
    res.json({ ok:true });
});

app.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
    console.log(`🔎 Environment detection order: APP_ENV override > custom domains > Railway patterns > localhost > fallback`);
    console.log(`💡 Set APP_ENV=production or APP_ENV=test in Railway variables to force mode.`);
});
