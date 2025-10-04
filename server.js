require("dotenv").config();
const express = require("express");
const cors = require("cors");

// Domain-based environment detection
const getEnvironmentFromDomain = (req) => {
    const host = req?.get("host") || process.env.HOST || "localhost";
    
    if (host.includes("tablet.msbdance.com") && !host.includes("test.")) {
        return "production";
    } else if (host.includes("test.tablet.msbdance.com")) {
        return "test";
    } else {
        return "local";
    }
};

// Helper function to get Stripe instance for current request
const getStripeForRequest = (req) => {
    const environment = getEnvironmentFromDomain(req);
    const stripeKey = environment === "production" 
        ? process.env.STRIPE_LIVE_KEY 
        : process.env.STRIPE_TEST_KEY;
    
    console.log(` Request from: ${req.get("host")}  Environment: ${environment}`);
    console.log(` Using ${environment === "production" ? "LIVE" : "TEST"} Stripe key`);
    
    return require("stripe")(stripeKey);
};

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
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

// Stripe payment endpoint
app.post("/create-payment-intent", async (req, res) => {
    console.log("💰 Payment intent request received:", req.body);
    try {
        const stripe = getStripeForRequest(req);
        const environment = getEnvironmentFromDomain(req);
        const { amount, currency = "usd", description = "Dance class payment", payment_method_id } = req.body;
        
        console.log(`💳 Creating payment intent: $${amount} ${currency}`);
        
        // Create or find customer by phone number
        const { phone, name, email } = req.body;
        let customer;
        
        if (phone) {
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
                console.log(`👤 Found existing customer: ${customer.id} for phone ${phone}`);
                
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
            } else {
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
        }

        const paymentIntentData = {
            amount: Math.round(amount * 100),
            currency,
            description,
            confirmation_method: 'manual',
            confirm: true,
            payment_method_types: ['card'], // Only allow card payments
            return_url: `${req.protocol}://${req.get('host')}/options`, // Return URL for redirects
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
        const stripe = getStripeForRequest(req);
        const { phone } = req.body;
        
        if (!phone) {
            return res.json({ payment_methods: [] });
        }
        
        // Try multiple ways to find customer by phone number
        let customer = null;
        
        // Method 1: Search by phone in metadata (tablet system)
        const metadataCustomers = await stripe.customers.search({
            query: `metadata['phone']:'${phone}'`,
            limit: 1
        });
        
        if (metadataCustomers.data.length > 0) {
            customer = metadataCustomers.data[0];
            console.log(`� Found customer ${customer.id} via metadata for phone ${phone}`);
        } else {
            // Method 2: Search by phone field directly (other systems)
            const phoneCustomers = await stripe.customers.search({
                query: `phone:'${phone}'`,
                limit: 1
            });
            
            if (phoneCustomers.data.length > 0) {
                customer = phoneCustomers.data[0];
                console.log(`👤 Found customer ${customer.id} via phone field for phone ${phone}`);
            }
        }
        
        if (!customer) {
            console.log(`📱 No customer found for phone ${phone} (searched metadata and phone field)`);
            return res.json({ payment_methods: [] });
        }
        console.log(`👤 Found customer ${customer.id} for phone ${phone}`);
        
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
        const stripe = getStripeForRequest(req);
        const environment = getEnvironmentFromDomain(req);
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
            automatic_payment_methods: { enabled: true },
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
    const environment = getEnvironmentFromDomain(req);
    res.json({ 
        status: "ok", 
        host: req.get("host"),
        environment: environment,
        stripe: environment === "production" ? "LIVE MODE" : "TEST MODE"
    });
});

app.listen(PORT, () => {
    console.log(` Server running on http://localhost:${PORT}`);
    console.log(` Domain-based environment detection enabled`);
    console.log(` localhost/IP  TEST key`);
    console.log(` test.tablet.msbdance.com  TEST key`);
    console.log(` tablet.msbdance.com  LIVE key`);
});
