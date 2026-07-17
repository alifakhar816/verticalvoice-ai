interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

interface SendEmailResult {
  sent: boolean;
  error?: string;
}

/**
 * Sends via Resend's REST API directly (no SDK dependency, same fetch-based
 * pattern already used for Twilio/Ultravox in this codebase). Fails soft —
 * returns {sent:false} instead of throwing — so a missing/invalid API key
 * never breaks the tool call or webhook that triggered the notification;
 * it just means the notifications table has an unsent row instead of a
 * delivered one.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATIONS_FROM_EMAIL ?? "VerticalVoice AI <notifications@verticalvoice.ai>";

  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not configured — skipping send", {
      to: params.to,
      subject: params.subject,
    });
    return { sent: false, error: "not_configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: params.to,
        subject: params.subject,
        html: params.html,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[email] Resend send failed", res.status, text);
      return { sent: false, error: `resend_${res.status}` };
    }

    return { sent: true };
  } catch (err) {
    console.error("[email] Resend request threw", err);
    return { sent: false, error: "request_failed" };
  }
}
