-- Migration 131: Populate Legal Documents for Duotone Pro Center (Turkey)
-- Comprehensive Terms of Service, Privacy Policy, and Marketing Preferences
-- Compliant with Turkish KVKK (Personal Data Protection Law No. 6698)

-- Delete existing documents and insert new ones
DELETE FROM legal_documents WHERE document_type = 'terms';
DELETE FROM legal_documents WHERE document_type = 'privacy';
DELETE FROM legal_documents WHERE document_type = 'marketing';

-- Insert Terms of Service
INSERT INTO legal_documents (document_type, version, content, is_active, created_at, updated_at)
VALUES (
  'terms',
  '2026-01-01',
  '<div class="legal-document">
    <h1>Terms of Service</h1>
    <p class="effective-date"><strong>Effective Date:</strong> January 1, 2026</p>
    
    <h2>1. Introduction</h2>
    <p>Welcome to Duotone Pro Center ("Center", "we", "our", or "us"). These Terms of Service ("Terms") govern your use of our kitesurfing, windsurfing, wing foiling, and water sports services, facilities, equipment rental, instruction, and booking platform located in Turkey.</p>
    
    <p>By creating an account, making a booking, or using our services, you agree to be bound by these Terms. If you do not agree, please do not use our services.</p>
    
    <h2>2. Service Description</h2>
    <p>Duotone Pro Center provides:</p>
    <ul>
      <li>Kitesurfing, windsurfing, wing foiling, and water sports instruction</li>
      <li>Equipment rental (kites, boards, wetsuits, harnesses, safety equipment)</li>
      <li>Beach facilities and storage services</li>
      <li>Online booking and payment platform</li>
      <li>Weather forecasting and conditions updates</li>
      <li>Equipment sales and pro shop services</li>
    </ul>
    
    <h2>3. Account Registration</h2>
    <p><strong>3.1 Eligibility:</strong> You must be at least 18 years old to create an account. Minors (under 18) may participate with parental consent and supervision.</p>
    
    <p><strong>3.2 Account Information:</strong> You agree to provide accurate, current information and maintain the security of your account credentials.</p>
    
    <p><strong>3.3 Account Responsibility:</strong> You are responsible for all activities under your account.</p>
    
    <h2>4. Bookings and Payments</h2>
    <p><strong>4.1 Booking Confirmation:</strong> Bookings are confirmed upon payment. You will receive a confirmation email with booking details.</p>
    
    <p><strong>4.2 Payment:</strong> We accept credit cards, debit cards, and bank transfers. All prices are in Turkish Lira (TRY) unless otherwise stated.</p>
    
    <p><strong>4.3 Cancellation Policy:</strong></p>
    <ul>
      <li>More than 48 hours before: Full refund</li>
      <li>24-48 hours before: 50% refund</li>
      <li>Less than 24 hours: No refund</li>
      <li>Weather-related cancellations by the Center: Full refund or reschedule</li>
    </ul>
    
    <p><strong>4.4 No-Show:</strong> Failure to arrive for your booking without cancellation results in forfeiture of payment.</p>
    
    <h2>5. Safety Requirements</h2>
    <p><strong>5.1 Liability Waiver:</strong> All participants must sign a liability waiver in person at the Center before participation. This is non-negotiable for safety and legal reasons.</p>
    
    <p><strong>5.2 Health Declaration:</strong> You must disclose any medical conditions that may affect your ability to safely participate.</p>
    
    <p><strong>5.3 Swimming Ability:</strong> Participants must be competent swimmers.</p>
    
    <p><strong>5.4 Equipment Safety:</strong> You agree to use all equipment as instructed and wear required safety gear.</p>
    
    <p><strong>5.5 Instructor Authority:</strong> You agree to follow all instructions from Center staff and may be removed from activities for non-compliance.</p>
    
    <h2>6. Equipment Rental</h2>
    <p><strong>6.1 Condition:</strong> Equipment is provided in good working condition. Inspect equipment before use and report any issues immediately.</p>
    
    <p><strong>6.2 Liability for Damage:</strong> You are responsible for lost, stolen, or damaged equipment beyond normal wear and tear. Charges apply based on replacement cost.</p>
    
    <p><strong>6.3 Return:</strong> Equipment must be returned clean and on time. Late returns incur additional charges.</p>
    
    <h2>7. Code of Conduct</h2>
    <p>You agree to:</p>
    <ul>
      <li>Treat staff, instructors, and other participants with respect</li>
      <li>Not engage in dangerous, reckless, or illegal behavior</li>
      <li>Not use services under the influence of alcohol or drugs</li>
      <li>Respect the environment and local community</li>
      <li>Follow Turkish laws and regulations</li>
    </ul>
    
    <h2>8. Intellectual Property</h2>
    <p>All content on our platform, including text, graphics, logos, and software, is the property of Duotone Pro Center and protected by Turkish and international copyright laws.</p>
    
    <h2>9. Limitation of Liability</h2>
    <p>To the maximum extent permitted by Turkish law, Duotone Pro Center is not liable for:</p>
    <ul>
      <li>Personal injury or death resulting from participation (covered by liability waiver)</li>
      <li>Loss or damage to personal property</li>
      <li>Indirect, incidental, or consequential damages</li>
      <li>Weather conditions or natural phenomena</li>
      <li>Service interruptions or technical issues</li>
    </ul>
    
    <h2>10. Indemnification</h2>
    <p>You agree to indemnify and hold harmless Duotone Pro Center from any claims, damages, or expenses arising from your violation of these Terms or your use of our services.</p>
    
    <h2>11. Governing Law and Jurisdiction</h2>
    <p>These Terms are governed by the laws of the Republic of Turkey. Any disputes shall be resolved in the courts of Turkey.</p>
    
    <h2>12. Changes to Terms</h2>
    <p>We may update these Terms at any time. Continued use of services after changes constitutes acceptance of the new Terms.</p>
    
    <h2>13. Contact Information</h2>
    <p>For questions about these Terms, contact us at:<br>
    <strong>Duotone Pro Center</strong><br>
    Email: info@duotoneprocenters.com<br>
    Website: www.duotoneprocenters.com</p>
  </div>',
  true,
  NOW(),
  NOW()
);

-- Insert Privacy Policy (KVKK Compliant)
INSERT INTO legal_documents (document_type, version, content, is_active, created_at, updated_at)
VALUES (
  'privacy',
  '2026-01-01',
  '<div class="legal-document">
    <h1>Privacy Policy</h1>
    <p class="effective-date"><strong>Effective Date:</strong> January 1, 2026</p>
    
    <h2>1. Introduction</h2>
    <p>Duotone Pro Center ("we", "our", or "us") is committed to protecting your personal data in accordance with Turkish Personal Data Protection Law No. 6698 (KVKK) and international best practices.</p>
    
    <p>This Privacy Policy explains how we collect, use, store, and protect your personal information when you use our services, website, or mobile applications.</p>
    
    <h2>2. Data Controller</h2>
    <p><strong>Data Controller:</strong> Duotone Pro Center<br>
    <strong>Contact:</strong> info@duotoneprocenters.com<br>
    <strong>Location:</strong> Turkey</p>
    
    <h2>3. Personal Data We Collect</h2>
    
    <h3>3.1 Information You Provide:</h3>
    <ul>
      <li><strong>Account Information:</strong> Name, email address, phone number, date of birth, nationality</li>
      <li><strong>Payment Information:</strong> Credit card details (processed securely by payment providers), billing address</li>
      <li><strong>Health Information:</strong> Medical conditions relevant to safe participation (voluntary disclosure)</li>
      <li><strong>Emergency Contact:</strong> Name and phone number of emergency contact person</li>
      <li><strong>Liability Waiver:</strong> Signed waiver documents with your signature</li>
      <li><strong>Identification:</strong> ID/passport number for verification purposes</li>
    </ul>
    
    <h3>3.2 Automatically Collected Information:</h3>
    <ul>
      <li><strong>Usage Data:</strong> IP address, browser type, device information, pages visited, time spent</li>
      <li><strong>Location Data:</strong> Approximate location based on IP address</li>
      <li><strong>Cookies:</strong> Session cookies, preference cookies, analytics cookies</li>
    </ul>
    
    <h3>3.3 Third-Party Information:</h3>
    <ul>
      <li>Information from social media platforms if you connect your account</li>
      <li>Payment verification from financial institutions</li>
    </ul>
    
    <h2>4. How We Use Your Personal Data</h2>
    
    <h3>4.1 Legal Basis for Processing (KVKK Article 5):</h3>
    <ul>
      <li><strong>Explicit Consent:</strong> Marketing communications, photo/video usage</li>
      <li><strong>Contract Performance:</strong> Providing services, processing bookings, equipment rental</li>
      <li><strong>Legal Obligation:</strong> Tax records, liability waivers, safety documentation</li>
      <li><strong>Legitimate Interests:</strong> Service improvement, security, fraud prevention</li>
    </ul>
    
    <h3>4.2 Specific Purposes:</h3>
    <ul>
      <li>Process bookings and provide services</li>
      <li>Communicate about your bookings and service updates</li>
      <li>Process payments and prevent fraud</li>
      <li>Ensure safety and compliance with liability requirements</li>
      <li>Send marketing communications (with your consent)</li>
      <li>Improve our services and customer experience</li>
      <li>Comply with legal and regulatory requirements</li>
      <li>Resolve disputes and enforce our Terms</li>
    </ul>
    
    <h2>5. Data Sharing and Disclosure</h2>
    
    <p>We may share your personal data with:</p>
    
    <h3>5.1 Service Providers:</h3>
    <ul>
      <li>Payment processors (secure encrypted transmission)</li>
      <li>Cloud hosting services</li>
      <li>Email and SMS service providers</li>
      <li>Analytics providers</li>
    </ul>
    
    <h3>5.2 Legal Requirements:</h3>
    <ul>
      <li>Turkish tax authorities</li>
      <li>Law enforcement when legally required</li>
      <li>Legal proceedings and dispute resolution</li>
    </ul>
    
    <h3>5.3 Business Transfers:</h3>
    <p>In the event of merger, acquisition, or sale, your data may be transferred to the new entity.</p>
    
    <p><strong>We do NOT sell your personal data to third parties.</strong></p>
    
    <h2>6. International Data Transfers</h2>
    <p>Some service providers (e.g., cloud hosting, payment processors) may be located outside Turkey. We ensure adequate safeguards are in place as required by KVKK Article 9, including:</p>
    <ul>
      <li>Standard contractual clauses</li>
      <li>Privacy Shield frameworks where applicable</li>
      <li>Explicit consent for transfers when required</li>
    </ul>
    
    <h2>7. Data Retention</h2>
    <p>We retain your personal data for as long as necessary for the purposes outlined in this policy:</p>
    <ul>
      <li><strong>Account Data:</strong> Duration of account + 2 years after closure</li>
      <li><strong>Booking Records:</strong> 10 years (Turkish tax law requirement)</li>
      <li><strong>Liability Waivers:</strong> 10 years (legal requirement)</li>
      <li><strong>Marketing Consent:</strong> Until withdrawn or 3 years of inactivity</li>
      <li><strong>Payment Records:</strong> 10 years (tax and financial regulations)</li>
    </ul>
    
    <h2>8. Your Rights Under KVKK</h2>
    
    <p>In accordance with KVKK Article 11, you have the right to:</p>
    
    <ul>
      <li><strong>Access:</strong> Request information about your personal data we process</li>
      <li><strong>Rectification:</strong> Request correction of inaccurate or incomplete data</li>
      <li><strong>Erasure:</strong> Request deletion of your personal data (subject to legal retention requirements)</li>
      <li><strong>Objection:</strong> Object to processing of your personal data</li>
      <li><strong>Data Portability:</strong> Request your data in a structured, commonly used format</li>
      <li><strong>Withdraw Consent:</strong> Withdraw consent for marketing or other consent-based processing</li>
      <li><strong>Complain:</strong> File a complaint with the Turkish Personal Data Protection Authority (KVKK Kurumu)</li>
    </ul>
    
    <p><strong>To exercise your rights, contact us at:</strong> info@duotoneprocenters.com</p>
    
    <h2>9. Data Security</h2>
    <p>We implement appropriate technical and organizational measures to protect your personal data:</p>
    <ul>
      <li>SSL/TLS encryption for data transmission</li>
      <li>Encrypted database storage</li>
      <li>Access controls and authentication</li>
      <li>Regular security audits</li>
      <li>Employee confidentiality agreements</li>
      <li>Secure payment processing (PCI DSS compliant)</li>
    </ul>
    
    <h2>10. Cookies and Tracking</h2>
    <p>We use cookies to enhance your experience. You can control cookies through your browser settings. Types of cookies we use:</p>
    <ul>
      <li><strong>Essential Cookies:</strong> Required for website functionality</li>
      <li><strong>Preference Cookies:</strong> Remember your settings and preferences</li>
      <li><strong>Analytics Cookies:</strong> Help us understand how you use our site</li>
      <li><strong>Marketing Cookies:</strong> Track effectiveness of advertising (with your consent)</li>
    </ul>
    
    <h2>11. Children''s Privacy</h2>
    <p>Our services are not directed to children under 13. We do not knowingly collect data from children under 13. Minors (13-17) may use services with parental consent.</p>
    
    <h2>12. Changes to This Privacy Policy</h2>
    <p>We may update this Privacy Policy to reflect changes in our practices or legal requirements. We will notify you of material changes via email or website notice.</p>
    
    <h2>13. Contact Us</h2>
    <p>For questions about this Privacy Policy or to exercise your rights:<br>
    <strong>Email:</strong> info@duotoneprocenters.com<br>
    <strong>Data Protection Officer:</strong> dpo@duotoneprocenters.com</p>
    
    <h3>Turkish Personal Data Protection Authority:</h3>
    <p>If you are not satisfied with our response, you may file a complaint with:<br>
    Kişisel Verileri Koruma Kurumu (KVKK)<br>
    Website: www.kvkk.gov.tr</p>
  </div>',
  true,
  NOW(),
  NOW()
);

-- Insert Marketing Preferences
INSERT INTO legal_documents (document_type, version, content, is_active, created_at, updated_at)
VALUES (
  'marketing',
  '2026-01-01',
  '<div class="legal-document">
    <h2>Marketing Communication Preferences</h2>
    
    <p>Duotone Pro Center would like to keep you informed about our services, special offers, events, and important updates through various communication channels.</p>
    
    <h3>What You''ll Receive:</h3>
    
    <h4>📧 Email Communications:</h4>
    <ul>
      <li>Booking confirmations and reminders</li>
      <li>Weather and wind condition updates</li>
      <li>New course offerings and special events</li>
      <li>Equipment sales and rental promotions</li>
      <li>Seasonal offers and early bird discounts</li>
      <li>Safety tips and kitesurfing techniques</li>
      <li>Newsletter with center news and community updates</li>
    </ul>
    
    <h4>📱 SMS Messages:</h4>
    <ul>
      <li>Last-minute booking confirmations</li>
      <li>Urgent weather condition changes</li>
      <li>Schedule changes or cancellations</li>
      <li>Time-sensitive special offers</li>
      <li>Important safety alerts</li>
    </ul>
    
    <h4>💬 WhatsApp:</h4>
    <ul>
      <li>Concierge-style customer support</li>
      <li>Quick booking assistance</li>
      <li>Real-time updates during your visit</li>
      <li>Travel and accommodation recommendations</li>
      <li>Equipment advice and questions</li>
      <li>Community group invitations</li>
    </ul>
    
    <h3>Your Control:</h3>
    <p>You have complete control over how we contact you:</p>
    <ul>
      <li>✅ Opt in or out of each channel independently</li>
      <li>✅ Change your preferences anytime from your profile</li>
      <li>✅ Unsubscribe from emails with one click</li>
      <li>✅ Reply STOP to SMS messages to unsubscribe</li>
      <li>✅ Block or unmute WhatsApp messages as you prefer</li>
    </ul>
    
    <h3>Important Notes:</h3>
    <p><strong>Transactional Messages:</strong> Even if you opt out of marketing, you will still receive essential transactional messages related to your bookings, account, and safety (e.g., booking confirmations, safety alerts).</p>
    
    <p><strong>Data Protection:</strong> Your contact information is used solely for the purposes you consent to. We never sell or share your data with third parties for their marketing purposes. See our Privacy Policy for full details.</p>
    
    <p><strong>Frequency:</strong> We respect your inbox. Marketing emails are sent 2-4 times per month. SMS messages are reserved for urgent or time-sensitive information only.</p>
    
    <h3>KVKK Compliance:</h3>
    <p>In accordance with Turkish Personal Data Protection Law (KVKK), we process your contact information for marketing purposes only with your explicit consent. You may withdraw consent at any time without affecting your ability to use our services.</p>
    
    <p><strong>To update preferences, contact us at:</strong> info@duotoneprocenters.com</p>
  </div>',
  true,
  NOW(),
  NOW()
)


