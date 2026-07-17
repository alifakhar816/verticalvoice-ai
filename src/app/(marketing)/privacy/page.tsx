import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | VerticalVoice AI',
  description: 'How VerticalVoice AI collects, uses, and protects data.',
};

const sections = [
  {
    title: 'Draft status',
    body: 'This is a draft privacy policy published for a final-year-project demonstration. It has not been reviewed by legal counsel and is not a binding commitment. Before any real commercial launch, this document will be replaced with a policy reviewed by a qualified privacy and data-protection lawyer, particularly given the multi-vertical (healthcare, restaurant, real estate) and multi-jurisdiction nature of the product.',
  },
  {
    title: 'Who this covers',
    body: 'VerticalVoice AI operates the platform. Each business (the tenant) using VerticalVoice AI is the data controller for their own end-customers’ data (callers, patients, diners, leads). VerticalVoice AI acts as a data processor on the tenant’s behalf for call data.',
  },
  {
    title: 'What data is collected',
    body: 'Account and tenant data (business profiles, team member emails and names); call data (caller and called phone numbers, duration, recording, transcript); industry-specific data captured during calls (for example, appointment details for healthcare, order and reservation details for restaurants, lead details for real estate); and usage, billing, and audit-log data.',
  },
  {
    title: 'How data is collected',
    body: 'Directly from tenant admins during signup and setup; from end-customers via phone calls handled by the AI agent; and from telephony and voice providers (Twilio, Ultravox) via authenticated webhooks.',
  },
  {
    title: 'Recording and consent',
    body: 'Call recording consent requirements vary by jurisdiction, including two-party-consent states. Recording behavior is configurable per tenant. Businesses using this platform are responsible for complying with applicable consent laws in their jurisdiction.',
  },
  {
    title: 'Data retention and deletion',
    body: 'Tenant data is retained for the life of the account. Account owners can request data export or deletion through their dashboard settings or by contacting support.',
  },
  {
    title: 'Healthcare data (PHI)',
    body: 'Real protected health information (PHI) is not supported in the current deployment. Healthcare features operate in a synthetic and demo data mode only, pending the vendor agreements (including signed Business Associate Agreements) and security review required before handling real patient data.',
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-[68ch] px-6 py-20">
      <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
        Legal
      </p>
      <h1 className="mt-3 font-display text-4xl tracking-tight">
        Privacy Policy
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Last updated{' '}
        {new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </p>

      <div className="mt-12 space-y-10">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              {section.title}
            </h2>
            <p className="mt-3 text-base leading-7 text-muted-foreground">
              {section.body}
            </p>
          </section>
        ))}

        <section>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Contact
          </h2>
          <p className="mt-3 text-base leading-7 text-muted-foreground">
            Questions about this policy can be sent to{' '}
            <a
              href="mailto:support@verticalvoice.ai"
              className="text-brand hover:underline"
            >
              support@verticalvoice.ai
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
