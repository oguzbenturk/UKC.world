-- Seed: Initial waiver version (v1.0 English)
-- Date: 2025-10-13
-- Description: Seeds the database with the initial liability waiver version

INSERT INTO waiver_versions (
  version_number,
  language_code,
  content,
  is_active,
  effective_date
) VALUES (
  '1.0',
  'en',
  '<div class="waiver-content">
<h1>ASSUMPTION OF RISK AND LIABILITY WAIVER</h1>

<p class="intro"><strong>Please read this document carefully. By signing below, you acknowledge that you understand and accept the risks associated with water sports and extreme sports activities.</strong></p>

<h2>1. ASSUMPTION OF RISK</h2>
<p>I acknowledge that water sports activities including kitesurfing, windsurfing, surfing, and related activities are inherently dangerous and carry significant risks including, but not limited to:</p>
<ul>
  <li>Drowning or near-drowning</li>
  <li>Collision with other participants, equipment, or objects</li>
  <li>Equipment failure or malfunction</li>
  <li>Unpredictable weather and water conditions</li>
  <li>Physical injury including cuts, bruises, fractures, or more serious injuries</li>
  <li>Death</li>
</ul>
<p>I understand these risks and voluntarily assume all risks associated with participation in these activities.</p>

<h2>2. RELEASE OF LIABILITY</h2>
<p>I hereby release, waive, discharge, and hold harmless Plannivo, its owners, employees, instructors, agents, and affiliates from any and all liability, claims, demands, actions, and causes of action arising out of or related to any loss, damage, injury, or death that may be sustained by me or my property while participating in these activities, whether caused by the negligence of the releasees or otherwise, to the fullest extent permitted by law.</p>

<h2>3. MEDICAL FITNESS DECLARATION</h2>
<p>I declare that I am in good physical health and have no medical conditions that would prevent safe participation in water sports activities. I agree to disclose any relevant medical conditions to instructors before participating. I understand that I am responsible for determining whether I am physically fit to participate.</p>

<h2>4. EQUIPMENT RESPONSIBILITY</h2>
<p>I understand and agree to:</p>
<ul>
  <li>Use equipment only as instructed</li>
  <li>Follow all safety guidelines provided by instructors</li>
  <li>Inspect equipment before each use</li>
  <li>Report any equipment damage or malfunction immediately</li>
  <li>Accept financial responsibility for damage to equipment caused by my misuse or negligence</li>
</ul>

<h2>5. PHOTO/VIDEO CONSENT</h2>
<p>I grant permission to Plannivo to use photographs, videos, or other recordings of me taken during activities for marketing, promotional, and educational purposes. I understand I may opt out of this consent by notifying Plannivo in writing.</p>

<h2>6. EMERGENCY CONTACT AUTHORIZATION</h2>
<p>In the event of an emergency, I authorize Plannivo staff to:</p>
<ul>
  <li>Contact emergency medical services on my behalf</li>
  <li>Provide emergency medical treatment as deemed necessary by medical professionals</li>
  <li>Contact my emergency contact person</li>
</ul>

<h2>7. PARENTAL CONSENT (For Minors)</h2>
<p>I certify that I am the parent or legal guardian of the minor participant named on this waiver. I have read and understood this waiver and agree to its terms on behalf of the minor. I understand that I am assuming all risks associated with the minor''s participation and release Plannivo from all liability as described above.</p>

<h2>ACKNOWLEDGMENT</h2>
<p>I have read this waiver carefully, understand its contents, and sign it voluntarily with full knowledge of its significance.</p>
</div>',
  true,
  CURRENT_DATE
) ON CONFLICT (version_number, language_code) DO NOTHING;
