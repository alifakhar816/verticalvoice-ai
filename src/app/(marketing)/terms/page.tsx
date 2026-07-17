import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | VerticalVoice AI',
  description: 'The terms governing use of VerticalVoice AI.',
};

const sections = [
  {
    title: 'Draft status',
    body: 'This is a draft Terms of Service published for a final-year-project demonstration. It has not been reviewed by legal counsel and is not a binding contract. Before any real commercial launch, this document will be replaced with terms reviewed by qualified legal counsel.',
  },
  {
    title: 'The service',
    body: 'VerticalVoice AI provides a platform for businesses to configure and deploy an AI voice agent for handling inbound and outbound phone calls, tailored to their industry (healthcare, restaurant, or real estate).',
  },
  {
    title: 'Your account',
    body: 'You are responsible for the accuracy of the business information you provide and for maintaining the security of your account credentials. You must be authorized to act on behalf of the business you configure an agent for.',
  },
  {
    title: 'Acceptable use',
    body: 'You may not use the platform for unlawful robocalling, unsolicited telemarketing without required consent, harassment, or any purpose that violates applicable telecommunications, consumer protection, or data protection law in your jurisdiction. Outbound calling features are subject to additional consent and compliance requirements described in the product.',
  },
  {
    title: 'Industry-specific restrictions',
    body: 'The healthcare configuration is an administrative assistant only. It must not be used to provide diagnosis, medication dosing, or clinical advice, and must not process real protected health information (PHI) in the current deployment. The real-estate configuration must not be used in a manner that violates fair-housing law.',
  },
  {
    title: 'Service availability',
    body: 'The platform is provided on an "as is" basis without warranty of uninterrupted availability. This is a project deployment, not a service-level-agreement-backed commercial product.',
  },
  {
    title: 'Limitation of liability',
    body: 'To the maximum extent permitted by law, VerticalVoice AI is not liable for indirect, incidental, or consequential damages arising from use of the platform. This section is a placeholder pending legal review and is not a substitute for a properly drafted limitation-of-liability clause.',
  },
];

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-[68ch] px-6 py-20">
      <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
        Legal
      </p>
      <h1 className="mt-3 font-display text-4xl tracking-tight">
        Terms of Service
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
            Questions about these terms can be sent to{' '}
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
