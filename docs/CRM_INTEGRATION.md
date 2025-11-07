# Check-In Tablet ↔ CRM Integration

This tablet system integrates with **MyDanceDesk CRM** to sync check-ins and payments in real-time.

## 🔗 Related Project

**MyDanceDesk CRM**: `C:\Users\Shun Harris\Documents\MyDanceDesk`

## 🎯 What Gets Synced

### Check-Ins
- Customer information (name, phone, email)
- Class attended
- Check-in timestamp
- Payment info (if paid during check-in)

### Payments
- Customer information
- Payment amount and method
- Stripe payment ID (for card payments)
- Payment description and metadata

## ⚙️ Setup Instructions

### 1. Configure CRM Webhook URL

Add to your tablet system `.env` file:

```bash
# For testing
CRM_WEBHOOK_URL=https://test.mydancedesk.com/api/webhooks/tablet

# For production
CRM_WEBHOOK_URL=https://crm.msbdance.com/api/webhooks/tablet
```

### 2. Add Webhook Calls to Your Code

```javascript
const { sendCheckInToCRM } = require('./crm-webhook');

// After successful check-in + payment
await sendCheckInToCRM({
    phone: customer.phone,
    email: customer.email,
    first_name: customer.first_name,
    last_name: customer.last_name,
    class_name: selectedClass.name,
    checked_in_at: new Date().toISOString(),
    payment_amount: 20.00,
    payment_method: 'CARD',
    stripe_payment_id: paymentIntent.id,
    notes: 'Walk-in payment'
});
```

## 🔌 Available Webhook Endpoints

### From Tablet → CRM

**Check-Ins**: When members check in at the tablet, data is sent to CRM
```javascript
POST /graphql
{
  mutation: "createCheckIn",
  data: { memberPhone, classes, timestamp }
}
```

**Purchases**: When customers make purchases, records are synced
```javascript
POST /graphql
{
  mutation: "createPurchase",
  data: { customerInfo, amount, stripePaymentId }
}
```

### From CRM → Tablet

**Member Data**: Tablet can query member info for validation
```javascript
POST /graphql
{
  query: "getMemberByPhone",
  variables: { phone }
}
```

## 🔑 Environment Variables

Add to your `.env`:

```env
# Twenty CRM Integration
TWENTY_API_URL=https://your-crm.up.railway.app/graphql
TWENTY_API_KEY=your_api_key_here
TWENTY_ENABLED=true  # Set to false to disable CRM sync
```

## 📖 Full Integration Guide

For detailed integration steps, see CRM documentation:
`C:\Users\Shun Harris\Documents\MyDanceDesk\docs\TWENTY_CUSTOMIZATION_QUICK_START.md`

## 🎯 Status

- [ ] CRM customized with dance studio objects
- [ ] API integration code added to server.js
- [ ] Environment variables configured
- [ ] Integration tested locally
- [ ] Deployed to production

---

**Note**: The tablet system and CRM are separate projects that communicate via API. This keeps each system focused and independently deployable.
