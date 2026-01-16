import fetch from 'node-fetch';
import { EmailPayload } from './types';

const MAILERSEND_API_KEY = process.env.MAILERSEND_API_KEY!;
const MAILERSEND_API_URL = 'https://api.mailersend.com/v1';

// Verified sender email (must be verified in MailerSend account)
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@yourdomain.com';
const FROM_NAME = process.env.FROM_NAME || 'Interview Scheduling Team';

interface MailerSendResponse {
  message?: string;
  errors?: any;
}

/**
 * Send interview invitation email via MailerSend
 */
export async function sendInvitationEmail(payload: EmailPayload): Promise<{ success: boolean; error?: string }> {
  const emailBody = createEmailBody(payload);

  const mailPayload = {
    from: {
      email: FROM_EMAIL,
      name: FROM_NAME
    },
    to: [
      {
        email: payload.to,
        name: payload.candidateName
      }
    ],
    subject: `Interview Invitation - ${payload.roundName} at ${payload.company}`,
    text: emailBody,
    html: createEmailHtml(payload)
  };

  try {
    const response = await fetch(`${MAILERSEND_API_URL}/email`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MAILERSEND_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify(mailPayload)
    });

    if (response.status === 202 || response.status === 200) {
      // Email accepted
      return { success: true };
    }

    if (response.status === 429) {
      // Rate limit / quota exceeded
      return { success: false, error: 'quota_exhausted' };
    }

    const errorData = await response.json() as MailerSendResponse;
    const errorMsg = errorData.message || JSON.stringify(errorData.errors || {});

    return { success: false, error: `MailerSend error (${response.status}): ${errorMsg}` };
  } catch (error: any) {
    return { success: false, error: `Network error: ${error.message}` };
  }
}

/**
 * Create email body
 */
function createEmailBody(payload: EmailPayload): string {
  return `Dear ${payload.candidateName},

You have been invited to attend ${payload.roundName} for the position at ${payload.company}.

Interviewer: ${payload.interviewer}
Round: ${payload.roundName}

Please use the following link to schedule your interview:
${payload.roundLink}

If you have any questions, please don't hesitate to reach out.

Best regards,
${payload.company} Recruitment Team
`;
}

/**
 * Create HTML email body
 */
function createEmailHtml(payload: EmailPayload): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
    .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
    .button { display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Interview Invitation</h1>
    </div>
    <div class="content">
      <p>Dear <strong>${payload.candidateName}</strong>,</p>
      <p>You have been invited to attend <strong>${payload.roundName}</strong> for the position at <strong>${payload.company}</strong>.</p>
      <p><strong>Interviewer:</strong> ${payload.interviewer}</p>
      <p><strong>Round:</strong> ${payload.roundName}</p>
      <p>Please click the button below to schedule your interview:</p>
      <p style="text-align: center;">
        <a href="${payload.roundLink}" class="button">Schedule Interview</a>
      </p>
      <p>Or copy this link: <a href="${payload.roundLink}">${payload.roundLink}</a></p>
      <p>If you have any questions, please don't hesitate to reach out.</p>
      <p>Best regards,<br>${payload.company} Recruitment Team</p>
    </div>
    <div class="footer">
      <p>This is an automated message. Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Test MailerSend API connection
 */
export async function testMailerSendConnection(): Promise<boolean> {
  try {
    const response = await fetch(`${MAILERSEND_API_URL}/token`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${MAILERSEND_API_KEY}`
      }
    });

    return response.ok;
  } catch {
    return false;
  }
}
