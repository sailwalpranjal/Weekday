# Interview Automation System - Weekday Assignment

## Overview
Automated workflow system that processes candidate interview data, splits multi-round interviews, sends invitation emails via MailerSend, and calculates TAT (Turn Around Time).

## Assignment Tasks Completed

### ✅ Task 1 - Data Splitting
- Splits candidates with multiple rounds into separate rows
- Each row contains one round with its Calendly link
- Preserves all candidate and company information

### ✅ Task 2 - Mailer Integration
- Integrated MailerSend API for email delivery
- HTML email templates
- Each email includes candidate name, company, interviewer, and round-specific Calendly link

### ✅ Task 3 - TAT Calculation
- Records exact timestamp when email is sent (`mail_sent_at`)
- Calculates TAT = Mail Sent Time - Added On Time
- Stores TAT in seconds in Airtable

## Deliverables

1. **Airtable Base**:
   - 15 fields auto-created
   - Split records (one per round)
   - All data cleaned and structured
**Invite Link**- https://airtable.com/invite/l?inviteId=invcYhH9YYrJ8WrV8&inviteToken=ea1bcb36f26376b9384b808bd1019fbb69efe1a0311be669d19f89fd279d6121&utm_medium=email&utm_source=product_team&utm_content=transactional-alerts

2. **Data Splitting Script**: `src/roundSplitter.ts` + orchestration in `src/index.ts`

3. **MailerSend Integration**: `src/emailSender.ts`

4. **TAT Field**: `tat_seconds` (number field in Airtable)

## Setup & Run

```bash
# Install dependencies
npm install

# Build
npm run build

# Run automation
node dist/index.js --csv "FO Coding Assignment - Sheet1.csv"
```

## Implementation Note

The assignment requested Airtable Scripts/Automation, but this implementation uses a standalone Node.js application because:
- Airtable Scripts in free tier cannot make external API calls (MailerSend)
- Node.js approach provides better error handling and logging
