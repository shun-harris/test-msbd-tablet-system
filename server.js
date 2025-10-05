require("dotenv").config();
const express = require("express");
const cors = require("cors");

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
    // Current naming patterns:
    //  - test-msbd-tablet-system-production.up.railway.app  (test)
    //  - prod-msbd-tablet-system-production.up.railway.app  (prod dedicated)
    //  - msbd-tablet-system-production.up.railway.app       (legacy / fallback prod pattern)
    if (/test-msbd-tablet-system.*\.up\.railway\.app$/.test(rawHost)) return { env:'test', reason:'railway test pattern', host:rawHost, forwarded };
    if (/prod-msbd-tablet-system.*\.up\.railway\.app$/.test(rawHost)) return { env:'production', reason:'railway prod pattern (prod-msbd)', host:rawHost, forwarded };
    if (/msbd-tablet-system.*\.up\.railway\.app$/.test(rawHost)) return { env:'production', reason:'railway prod pattern (legacy)', host:rawHost, forwarded };

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

// CORS configuration (explicit whitelist so we can safely allow localhost + test hitting prod API)
const ALLOWED_ORIGINS = [
    'https://tablet.msbdance.com',
    'https://test.tablet.msbdance.com',
    'https://prod-msbd-tablet-system-production.up.railway.app',
    'https://test-msbd-tablet-system-production.up.railway.app',
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
        version: "v2.4.0"
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

        // If payment method is provided, use it directly
        if (payment_method_id) {
            paymentIntentData.payment_method = payment_method_id;
            console.log(`🎯 Using saved payment method: ${payment_method_id}`);
        } else {
            // For new cards, save them automatically after payment
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
        const { phone, email } = req.body;
        
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
        stripe: det.env === 'production' ? 'LIVE MODE' : 'TEST MODE'
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
    console.log(`🔎 Environment detection order: APP_ENV override > custom domains > Railway patterns > localhost > fallback`);
    console.log(`💡 Set APP_ENV=production or APP_ENV=test in Railway variables to force mode.`);
});
