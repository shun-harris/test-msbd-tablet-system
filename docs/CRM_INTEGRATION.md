# CRM Integration

This tablet system integrates with **MyDanceDesk** (a customized Twenty CRM) to sync member data, check-ins, and purchases.

## 🔗 Related Project

**MyDanceDesk**: `C:\Users\Shun Harris\Documents\MyDanceDesk`

The CRM is a separate project built on Twenty open-source platform, customized for dance studio operations.

## 📚 CRM Documentation

All CRM-related documentation is maintained in the CRM repository:
- Setup Guide
- Customization Reference
- API Integration Examples

See: `C:\Users\Shun Harris\Documents\MyDanceDesk\docs\`

## 🔌 Integration Points

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
