/**
 * CRM Webhook Integration
 * Sends check-in and payment data to MyDanceDesk CRM
 */

const CRM_WEBHOOK_URL = process.env.CRM_WEBHOOK_URL;
const ENABLE_CRM_SYNC = !!CRM_WEBHOOK_URL;

// Log CRM sync status at module load (startup)
if (ENABLE_CRM_SYNC) {
    console.log('✅ CRM sync ENABLED');
    console.log(`   └─ Webhook URL: ${CRM_WEBHOOK_URL}`);
    console.log(`   └─ Check-in endpoint: ${CRM_WEBHOOK_URL}/check-in`);
    
    // Test connectivity on startup (non-blocking)
    (async () => {
        try {
            const healthUrl = CRM_WEBHOOK_URL.replace(/\/tablet\/?$/, '/tablet/health');
            const response = await fetch(healthUrl, { method: 'GET', timeout: 5000 });
            if (response.ok) {
                const health = await response.json();
                console.log(`   └─ CRM connection verified: ${health.status} (${health.tablet_checkins_last_24h} check-ins in last 24h)`);
            } else {
                console.warn(`   └─ ⚠️  CRM health check failed: HTTP ${response.status}`);
            }
        } catch (err) {
            console.warn(`   └─ ⚠️  CRM health check error: ${err.message}`);
        }
    })();
} else {
    console.warn('⚠️  CRM sync DISABLED (CRM_WEBHOOK_URL not set)');
    console.warn('   └─ Check-ins will NOT be synced to MyDanceDesk CRM!');
    console.warn('   └─ Set CRM_WEBHOOK_URL to enable sync (e.g., https://app.mydancedesk.com/api/webhooks/tablet)');
}

/**
 * Send check-in data to CRM
 * @param {Object} data Check-in data
 * @param {string} data.phone Customer phone number
 * @param {string} data.email Customer email
 * @param {string} data.first_name Customer first name
 * @param {string} data.last_name Customer last name
 * @param {string} data.class_name Class name
 * @param {string} data.checked_in_at ISO timestamp
 * @param {number} data.payment_amount Payment amount (if any)
 * @param {string} data.payment_method Payment method (CASH, CARD, etc)
 * @param {string} data.stripe_payment_id Stripe payment ID (if card payment)
 * @param {string} data.notes Additional notes
 */
async function sendCheckInToCRM(data) {
    if (!ENABLE_CRM_SYNC) {
        console.log('ℹ️ CRM sync disabled (no CRM_WEBHOOK_URL configured)');
        return { success: false, reason: 'disabled' };
    }

    try {
        console.log(`📤 Sending check-in to CRM: ${data.phone || data.email}`);
        
        const response = await fetch(`${CRM_WEBHOOK_URL}/check-in`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`CRM webhook failed: ${response.status} - ${error}`);
        }

        const result = await response.json();
        console.log(`✅ Check-in synced to CRM: ${result.contact_id}`);
        return { success: true, result };

    } catch (error) {
        console.error('❌ Failed to sync check-in to CRM:', error.message);
        // Don't throw - we don't want to fail the check-in if CRM sync fails
        return { success: false, error: error.message };
    }
}

/**
 * Send payment data to CRM
 * @param {Object} data Payment data
 * @param {string} data.phone Customer phone number
 * @param {string} data.email Customer email
 * @param {string} data.first_name Customer first name
 * @param {string} data.last_name Customer last name
 * @param {number} data.amount Payment amount
 * @param {number} data.payment_amount Payment amount (for credit calculation)
 * @param {string} data.currency Currency code (default: USD)
 * @param {string} data.method Payment method (CASH, CARD, etc)
 * @param {string} data.stripe_payment_id Stripe payment ID (if card payment)
 * @param {string} data.stripe_customer_id Stripe customer ID
 * @param {string} data.purchase_type Purchase type: 'credits' or 'membership'
 * @param {string} data.plan_name Membership plan name (if membership)
 * @param {string} data.description Payment description
 * @param {Object} data.metadata Additional metadata
 */
async function sendPaymentToCRM(data) {
    if (!ENABLE_CRM_SYNC) {
        console.log('ℹ️ CRM sync disabled (no CRM_WEBHOOK_URL configured)');
        return { success: false, reason: 'disabled' };
    }

    try {
        console.log(`📤 Sending payment to CRM: $${data.amount} from ${data.phone || data.email} (type: ${data.purchase_type || 'unknown'})`);
        
        // Send to /check-in endpoint with purchase_type
        // This will trigger credit calculation or membership setup
        const response = await fetch(`${CRM_WEBHOOK_URL}/check-in`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`CRM webhook failed: ${response.status} - ${error}`);
        }

        const result = await response.json();
        console.log(`✅ Payment synced to CRM:`, result);
        return { success: true, result };

    } catch (error) {
        console.error('❌ Failed to sync payment to CRM:', error.message);
        // Don't throw - we don't want to fail the payment if CRM sync fails
        return { success: false, error: error.message };
    }
}

/**
 * Check if CRM sync is enabled
 */
function isCRMSyncEnabled() {
    return ENABLE_CRM_SYNC;
}

/**
 * Get CRM webhook URL (for debugging)
 */
function getCRMWebhookURL() {
    return CRM_WEBHOOK_URL || null;
}

module.exports = {
    sendCheckInToCRM,
    sendPaymentToCRM,
    isCRMSyncEnabled,
    getCRMWebhookURL
};
