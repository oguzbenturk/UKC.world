/**
 * Liability Waiver Content - Plannivo Water Sports
 * 
 * ⚠️ IMPORTANT: This is a DRAFT template and MUST be reviewed and approved
 * by qualified legal counsel before use. This waiver should be customized
 * to comply with local laws and regulations in your jurisdiction.
 * 
 * Version: 1.0
 * Effective Date: To be determined upon legal approval
 * Language: English (en)
 * 
 * @module waiverContent
 */

/**
 * Waiver metadata
 */
export const WAIVER_VERSION = '1.0';
export const WAIVER_LANGUAGE = 'en';
export const EFFECTIVE_DATE = new Date('2025-11-01'); // To be updated upon legal approval
export const COMPANY_NAME = 'Plannivo Water Sports';
export const COMPANY_LOCATION = '[City, Country]'; // Update with actual location

/**
 * Full waiver content object
 * This is the master template used for digital signature collection
 */
export const waiverContent = {
  version: WAIVER_VERSION,
  language: WAIVER_LANGUAGE,
  effectiveDate: EFFECTIVE_DATE,
  companyName: COMPANY_NAME,
  
  /**
   * Waiver title and introduction
   */
  title: 'LIABILITY WAIVER AND RELEASE OF CLAIMS',
  
  introduction: {
    heading: 'Introduction and Acknowledgment',
    content: `
BY SIGNING THIS DOCUMENT, YOU WILL WAIVE CERTAIN LEGAL RIGHTS, INCLUDING THE RIGHT TO SUE OR CLAIM COMPENSATION FOLLOWING AN ACCIDENT.

Please read this document carefully before signing. This is a binding legal agreement. By signing this waiver, you acknowledge that you have read, understood, and agree to be bound by its terms.

This Liability Waiver and Release of Claims ("Waiver") is entered into by and between ${COMPANY_NAME} (the "Company") and the participant or guardian signing below (the "Participant").

The Participant wishes to participate in water sports activities, including but not limited to surfing, kitesurfing, windsurfing, paddleboarding, kayaking, sailing, and related instruction and equipment rental (collectively, the "Activities").
    `.trim()
  },

  /**
   * Assumption of Risk section
   * Covers water sports specific dangers
   */
  assumptionOfRisk: {
    heading: 'Assumption of Risk',
    content: `
The Participant acknowledges and understands that water sports activities involve inherent and significant risks, hazards, and dangers that no amount of care, caution, instruction, or expertise can eliminate. These risks include, but are not limited to:

**WATER-RELATED HAZARDS:**
• Drowning or near-drowning incidents
• Strong currents, rip tides, and undertows
• Unpredictable wave conditions and surf
• Cold water exposure and hypothermia
• Marine life encounters (jellyfish, sea urchins, etc.)
• Submerged objects, reefs, and rocks
• Water pollution and contamination

**WEATHER AND ENVIRONMENTAL RISKS:**
• Sudden weather changes and storms
• Lightning strikes
• High winds and wind gusts
• Poor visibility conditions
• Sun exposure, heat exhaustion, and dehydration
• Extreme temperatures

**EQUIPMENT-RELATED RISKS:**
• Equipment failure or malfunction
• Improper use of equipment
• Collisions with equipment (boards, sails, kites, etc.)
• Entanglement in lines, leashes, or rigging
• Loss of control of equipment

**PHYSICAL AND MEDICAL RISKS:**
• Cuts, bruises, sprains, and fractures
• Head, neck, and spinal injuries
• Muscle strains and joint injuries
• Exhaustion and physical fatigue
• Allergic reactions
• Pre-existing medical condition complications
• Permanent disability or death

**RISKS FROM OTHER PARTICIPANTS:**
• Collisions with other participants
• Collisions with watercraft (boats, jet skis, etc.)
• Negligence or recklessness of other water users

**FACILITY AND INSTRUCTION RISKS:**
• Slips, trips, and falls on docks, beaches, or facilities
• Inadequate supervision or instruction
• Communication difficulties in water or adverse conditions

The Participant acknowledges that the above list is not exhaustive and that other risks, both known and unknown, anticipated and unanticipated, may also result in injury, illness, or death.

**I FREELY ACCEPT AND FULLY ASSUME ALL SUCH RISKS, DANGERS, AND HAZARDS and the possibility of personal injury, death, property damage, or loss resulting from my participation in the Activities.**
    `.trim()
  },

  /**
   * Release of Liability section
   */
  releaseOfLiability: {
    heading: 'Release of Liability and Waiver of Claims',
    content: `
In consideration of being permitted to participate in the Activities, the Participant, for themselves and on behalf of their heirs, next of kin, executors, administrators, and assigns, HEREBY:

1. **RELEASES, WAIVES, AND DISCHARGES** ${COMPANY_NAME}, its owners, directors, officers, employees, instructors, agents, contractors, sponsors, and affiliated organizations (collectively, the "Released Parties") from any and all liability, claims, demands, actions, and causes of action whatsoever, whether in law or equity, arising out of or related to any loss, damage, injury, or death that may be sustained by the Participant or any property belonging to the Participant, WHETHER CAUSED BY THE NEGLIGENCE OF THE RELEASED PARTIES OR OTHERWISE, while participating in the Activities or while on the premises owned or controlled by the Company.

2. **AGREES NOT TO SUE** the Released Parties for any claims, demands, or causes of action that the Participant may have, now or in the future, related to participation in the Activities.

3. **INDEMNIFIES AND HOLDS HARMLESS** the Released Parties from any loss, liability, damage, or costs, including legal fees, that may occur due to the Participant's participation in the Activities, WHETHER CAUSED BY THE NEGLIGENCE OF THE RELEASED PARTIES OR OTHERWISE.

4. **ACKNOWLEDGES** that this release is intended to be as broad and inclusive as permitted by law. If any portion of this agreement is held invalid, the remainder shall continue in full legal force and effect.

5. **UNDERSTANDS** that this is a complete and unconditional release of all liability to the greatest extent allowed by law, and that it applies to injuries or damages caused in whole or in part by the acts or omissions, negligent or otherwise, of the Released Parties.
    `.trim()
  },

  /**
   * Medical Fitness Declaration
   */
  medicalFitness: {
    heading: 'Medical Fitness Declaration',
    content: `
The Participant represents and warrants that:

1. **PHYSICAL CONDITION:** I am in good physical and mental health and have no medical conditions, impairments, or disabilities that would prevent me from safely participating in water sports activities or that would increase my risk of injury or death.

2. **MEDICAL DISCLOSURE:** I have fully disclosed any and all medical conditions, medications, allergies, or physical limitations that may affect my ability to safely participate in the Activities. I understand that failure to disclose such information may result in serious injury or death.

3. **SWIMMING ABILITY:** I possess adequate swimming skills and am comfortable in deep water and ocean/lake conditions. I understand that certain activities may require specific swimming competencies.

4. **MEDICAL ADVICE:** I have consulted with a physician if I have any concerns about my ability to participate in the Activities, and I have received clearance to participate.

5. **MEDICATIONS AND SUBSTANCES:** I am not under the influence of alcohol, drugs, or any other substance that would impair my judgment, coordination, or ability to safely participate in the Activities.

6. **PREGNANCY:** If applicable, I am not pregnant or, if I am pregnant, I have consulted with my physician and received clearance to participate in the Activities despite the known risks to pregnancy.

7. **MEDICAL EMERGENCIES:** I authorize the Company and its representatives to obtain emergency medical treatment on my behalf if I am unable to give consent due to injury, illness, or incapacity. I agree to be financially responsible for any medical costs incurred.

**CONDITIONS THAT MAY AFFECT PARTICIPATION:**
Participants with the following conditions should consult a physician before participating: heart conditions, high blood pressure, epilepsy, asthma, diabetes, pregnancy, recent surgeries, back/neck injuries, or any condition that may cause sudden incapacitation.

I understand that the Company does not provide medical, health, or disability insurance for participants, and I am solely responsible for obtaining such coverage.
    `.trim()
  },

  /**
   * Equipment Responsibility section
   */
  equipmentResponsibility: {
    heading: 'Equipment Use and Responsibility',
    content: `
The Participant acknowledges and agrees that:

1. **EQUIPMENT INSPECTION:** I have inspected all equipment provided by the Company and found it to be in safe and acceptable condition. I will immediately notify the Company of any equipment defects or safety concerns.

2. **PROPER USE:** I will use all equipment only for its intended purpose and in accordance with instructions provided by the Company's staff. I will not use equipment if I am unfamiliar with its operation or if I have not received adequate instruction.

3. **SAFETY EQUIPMENT:** I will wear all required safety equipment, including but not limited to life jackets, helmets, wetsuits, and impact vests, as directed by the Company's staff.

4. **EQUIPMENT CARE:** I will handle all equipment with reasonable care and will not intentionally damage, misuse, or abuse any equipment.

5. **EQUIPMENT LIABILITY:** I accept full financial responsibility for any equipment that is lost, stolen, or damaged beyond normal wear and tear while in my possession. I agree to pay the full replacement cost for lost or damaged equipment.

6. **EQUIPMENT RETURNS:** I will return all rented equipment at the designated time and location in the same condition as received, allowing for normal wear and tear.

7. **PERSONAL EQUIPMENT:** If I choose to use my own equipment, I acknowledge that it is my sole responsibility to ensure that such equipment is safe, properly maintained, and suitable for the Activities.

8. **EQUIPMENT FAILURE:** I understand that equipment may fail or malfunction despite proper maintenance and inspection, and I accept this risk as part of participation in the Activities.

**EQUIPMENT RENTAL AGREEMENT:**
If applicable, I agree to the following rental terms:
- Rental Period: As specified on booking confirmation
- Deposit/Security: As required by the Company
- Late Returns: Subject to additional charges
- Damage Assessment: Determined by the Company upon equipment return
    `.trim()
  },

  /**
   * Photo/Video Consent section
   */
  photoVideoConsent: {
    heading: 'Photo and Video Consent',
    content: `
The Participant acknowledges and agrees that:

1. **MEDIA CAPTURE:** ${COMPANY_NAME} and its representatives may take photographs, video recordings, or other media ("Media") of the Participant during the Activities and while on Company premises.

2. **MEDIA USE:** The Company may use such Media for promotional, marketing, advertising, and commercial purposes, including but not limited to:
   - Website and social media platforms
   - Print and digital advertising materials
   - Promotional videos and documentaries
   - Training and educational materials
   - News media and press releases

3. **RIGHTS GRANTED:** I grant the Company the irrevocable, perpetual, worldwide, royalty-free right and license to use, reproduce, modify, publish, and distribute the Media in any format or medium, now known or later developed.

4. **NO COMPENSATION:** I understand that I will not receive any compensation, royalties, or payment for the use of Media featuring my likeness, and I waive any right to inspect or approve the finished product or any written copy.

5. **NAME AND LIKENESS:** I grant permission for my name, image, and likeness to be used in connection with such Media.

6. **OPT-OUT OPTION:** ☐ **CHECK THIS BOX IF YOU DO NOT CONSENT** to being photographed or filmed. If you opt out, you understand that the Company will make reasonable efforts to exclude you from Media, but cannot guarantee complete exclusion in group settings.

7. **THIRD-PARTY MEDIA:** I understand that other participants may take photos or videos during the Activities, and the Company is not responsible for controlling or limiting such third-party Media.

**Note:** This consent is optional for participation in the Activities. Declining photo/video consent will not affect your ability to participate.
    `.trim()
  },

  /**
   * Emergency Contact Authorization
   */
  emergencyContactAuthorization: {
    heading: 'Emergency Contact and Medical Authorization',
    content: `
The Participant acknowledges and agrees that:

1. **EMERGENCY CONTACT INFORMATION:** I have provided accurate and current emergency contact information to the Company. I will immediately notify the Company of any changes to this information.

2. **MEDICAL TREATMENT AUTHORIZATION:** In the event of injury, illness, or medical emergency, I authorize the Company and its representatives to:
   - Assess my condition and determine the need for medical care
   - Contact emergency medical services (ambulance, paramedics, etc.)
   - Transport me to the nearest appropriate medical facility
   - Consent to emergency medical treatment, surgery, or hospitalization on my behalf if I am unable to provide consent
   - Share relevant medical information with healthcare providers

3. **MEDICAL COSTS:** I agree to be solely and fully responsible for all costs associated with any medical treatment, emergency response, ambulance transport, hospitalization, or other healthcare services required as a result of my participation in the Activities.

4. **INSURANCE:** I confirm that I have adequate health insurance coverage or, if I do not have insurance, I accept full financial responsibility for all medical expenses.

5. **PRE-EXISTING CONDITIONS:** I acknowledge that emergency medical treatment may be rendered without knowledge of my pre-existing medical conditions, allergies, or medications, and I accept this risk.

6. **COMMUNICATION:** I authorize the Company to contact my designated emergency contact(s) in the event of injury, illness, or emergency.

7. **DELAY IN TREATMENT:** I understand that the Company's facilities may be located in remote areas where immediate medical care may not be available, and I accept the risks associated with delayed medical treatment.

**EMERGENCY CONTACT INFORMATION:**
(To be provided during registration/check-in)
- Primary Contact Name: _______________
- Relationship: _______________
- Phone Number: _______________
- Secondary Contact (if applicable): _______________
    `.trim()
  },

  /**
   * Parental Consent section (for minors)
   */
  parentalConsent: {
    heading: 'Parental/Guardian Consent (For Participants Under 18)',
    content: `
**THIS SECTION MUST BE COMPLETED IF THE PARTICIPANT IS UNDER 18 YEARS OF AGE**

I, the undersigned parent or legal guardian of the minor participant named above, hereby:

1. **CONSENT TO PARTICIPATION:** I give my permission for my child/ward to participate in the Activities offered by ${COMPANY_NAME}.

2. **ACKNOWLEDGE RISKS:** I have read and understand the risks described in this Waiver, including the Assumption of Risk section, and I acknowledge that these risks apply to my child/ward.

3. **ACCEPT RESPONSIBILITY:** I accept full responsibility for my child/ward's participation in the Activities and acknowledge that I have the authority to sign this Waiver on their behalf.

4. **RELEASE AND INDEMNIFY:** On behalf of my child/ward and myself, I agree to all terms of this Waiver, including the Release of Liability and agreement to indemnify the Released Parties.

5. **MEDICAL AUTHORIZATION:** I authorize emergency medical treatment for my child/ward as described in the Emergency Contact Authorization section. I accept full financial responsibility for all medical costs.

6. **SUPERVISION:** I understand that:
   - The Company will provide reasonable supervision appropriate to the age and skill level of participants
   - I am responsible for ensuring my child/ward follows all safety instructions and rules
   - Minors may be asked to demonstrate adequate swimming ability before participating in certain activities
   - The Company reserves the right to exclude any participant who is unable to safely participate or who poses a risk to themselves or others

7. **SWIMMING ABILITY:** I confirm that my child/ward possesses adequate swimming skills for the Activities they will be participating in.

8. **MEDICAL INFORMATION:** I have fully disclosed any medical conditions, allergies, medications, or special needs that may affect my child/ward's participation.

9. **LEGAL CAPACITY:** I certify that I am the parent or legal guardian of the minor participant and have the legal authority to sign this Waiver on their behalf.

10. **AGE VERIFICATION:** I certify that the participant's age is accurately stated and that they meet any minimum age requirements for the Activities.

**PARENT/GUARDIAN INFORMATION:**
(To be provided during registration/check-in)
- Full Name: _______________
- Relationship to Minor: _______________
- Date of Birth: _______________
- Phone Number: _______________
- Email Address: _______________

**MINOR PARTICIPANT'S AGE:** _____ years old
    `.trim()
  },

  /**
   * Additional Terms and Conditions
   */
  additionalTerms: {
    heading: 'Additional Terms and Conditions',
    content: `
The Participant further acknowledges and agrees to the following:

1. **INSTRUCTIONS AND RULES:** I will follow all safety instructions, rules, and directions provided by the Company's staff at all times. I understand that failure to follow instructions may result in serious injury or death and may result in my immediate removal from the Activities without refund.

2. **CONDUCT:** I will conduct myself in a responsible and safe manner. I will not engage in reckless behavior, horseplay, or any conduct that may endanger myself or others.

3. **SUBSTANCE POLICY:** I will not participate in the Activities while under the influence of alcohol, illegal drugs, or any substance that impairs judgment or physical ability.

4. **CANCELLATIONS AND REFUNDS:** I understand that the Company may cancel or modify Activities due to weather, safety concerns, or other factors. Refund policies are subject to the Company's standard terms and conditions.

5. **PERSONAL PROPERTY:** I am solely responsible for my personal property. The Company is not liable for lost, stolen, or damaged personal items.

6. **ASSUMPTION OF FINANCIAL RESPONSIBILITY:** I agree to pay for any damages I cause to the Company's property, equipment, or facilities, as well as any injuries I cause to other participants or third parties.

7. **GOVERNING LAW:** This Waiver shall be governed by and construed in accordance with the laws of [Jurisdiction], without regard to conflict of law principles.

8. **JURISDICTION:** I agree that any disputes arising from this Waiver or my participation in the Activities shall be resolved exclusively in the courts of [Jurisdiction].

9. **SEVERABILITY:** If any provision of this Waiver is found to be unenforceable or invalid, the remaining provisions shall remain in full force and effect.

10. **ENTIRE AGREEMENT:** This Waiver constitutes the entire agreement between the Participant and the Company regarding the subject matter herein and supersedes all prior agreements, understandings, or representations.

11. **MODIFICATION:** This Waiver may not be modified except in writing signed by an authorized representative of the Company.

12. **VOLUNTARY PARTICIPATION:** I understand that participation in the Activities is purely voluntary and that I am free to discontinue participation at any time.

13. **ACKNOWLEDGMENT OF UNDERSTANDING:** I have read this entire Waiver, understand its contents, and voluntarily agree to its terms. I acknowledge that no verbal representations or statements have been made that alter the terms of this written agreement.
    `.trim()
  },

  /**
   * Signature and Acknowledgment section
   */
  signatureSection: {
    heading: 'Signature and Acknowledgment',
    content: `
**I HAVE CAREFULLY READ THIS LIABILITY WAIVER AND RELEASE OF CLAIMS, FULLY UNDERSTAND ITS CONTENTS, AND VOLUNTARILY AGREE TO ITS TERMS.**

**I UNDERSTAND THAT I AM GIVING UP SUBSTANTIAL LEGAL RIGHTS, INCLUDING THE RIGHT TO SUE.**

By signing below (electronically or otherwise), I acknowledge that:
• I have read and understood this entire Waiver
• I have had the opportunity to ask questions and seek independent legal advice
• I am signing this document voluntarily and without duress
• I understand that this is a legally binding document
• I am at least 18 years of age OR I am the parent/legal guardian of a minor participant

**Digital Signature:** [Signature to be captured electronically]

**Full Name:** [Auto-filled from participant information]

**Date Signed:** [Auto-filled with current date and time]

**IP Address:** [Auto-captured for verification]

**Waiver Version:** ${WAIVER_VERSION}

**Effective Date:** [Date from effective date field]

---

**FOR MINORS (Under 18 years of age):**

**Parent/Guardian Signature:** [Signature to be captured electronically]

**Parent/Guardian Full Name:** [To be provided]

**Relationship to Minor:** [To be provided]

**Date Signed:** [Auto-filled with current date and time]

---

**FOR COMPANY USE ONLY:**

Participant ID: _______________
Waiver Signed: _______________
Verified By: _______________
Notes: _______________
    `.trim()
  },

  /**
   * Footer and legal notices
   */
  footer: {
    content: `
---

**IMPORTANT LEGAL NOTICES:**

1. **LEGAL COUNSEL REVIEW:** This waiver has been reviewed by legal counsel and is designed to provide maximum protection under applicable law. However, the enforceability of this waiver may vary by jurisdiction.

2. **TRANSLATION:** If this waiver is translated into other languages, the English version shall control in the event of any discrepancies.

3. **UPDATES:** The Company reserves the right to update this waiver at any time. Participants will be required to sign the most current version.

4. **RECORD RETENTION:** Signed waivers will be retained in accordance with legal requirements and the Company's data retention policies.

5. **PRIVACY:** Personal information collected through this waiver will be handled in accordance with the Company's Privacy Policy and applicable data protection laws.

**CONTACT INFORMATION:**
${COMPANY_NAME}
[Address]
[Phone]
[Email]
[Website]

**Emergency Contact:** [Emergency Phone Number]

---

Document Version: ${WAIVER_VERSION}
Effective Date: [To be determined upon legal approval]
Last Updated: October 15, 2025

⚠️ **LEGAL DISCLAIMER:** This is a template document and must be reviewed and approved by qualified legal counsel licensed in your jurisdiction before use. Laws governing liability waivers vary significantly by location, and this document may not be enforceable in all jurisdictions. The company assumes no liability for the use of this template without proper legal review.
    `.trim()
  }
};

/**
 * Get formatted waiver text for display
 * Combines all sections into a single formatted document
 * 
 * @param {boolean} includeMinorSection - Whether to include parental consent section
 * @returns {string} Complete formatted waiver text
 */
export function getFormattedWaiverText(includeMinorSection = false) {
  const sections = [
    `# ${waiverContent.title}\n`,
    `**${waiverContent.companyName}**\n`,
    `**Version:** ${waiverContent.version} | **Effective Date:** ${waiverContent.effectiveDate.toLocaleDateString()}\n`,
    `---\n`,
    `## ${waiverContent.introduction.heading}\n`,
    waiverContent.introduction.content,
    `\n---\n`,
    `## ${waiverContent.assumptionOfRisk.heading}\n`,
    waiverContent.assumptionOfRisk.content,
    `\n---\n`,
    `## ${waiverContent.releaseOfLiability.heading}\n`,
    waiverContent.releaseOfLiability.content,
    `\n---\n`,
    `## ${waiverContent.medicalFitness.heading}\n`,
    waiverContent.medicalFitness.content,
    `\n---\n`,
    `## ${waiverContent.equipmentResponsibility.heading}\n`,
    waiverContent.equipmentResponsibility.content,
    `\n---\n`,
    `## ${waiverContent.photoVideoConsent.heading}\n`,
    waiverContent.photoVideoConsent.content,
    `\n---\n`,
    `## ${waiverContent.emergencyContactAuthorization.heading}\n`,
    waiverContent.emergencyContactAuthorization.content,
    `\n---\n`,
  ];

  if (includeMinorSection) {
    sections.push(
      `## ${waiverContent.parentalConsent.heading}\n`,
      waiverContent.parentalConsent.content,
      `\n---\n`
    );
  }

  sections.push(
    `## ${waiverContent.additionalTerms.heading}\n`,
    waiverContent.additionalTerms.content,
    `\n---\n`,
    `## ${waiverContent.signatureSection.heading}\n`,
    waiverContent.signatureSection.content,
    `\n`,
    waiverContent.footer.content
  );

  return sections.join('\n');
}

/**
 * Get plain text waiver content (no markdown formatting)
 * Used for email notifications and plain text displays
 * 
 * @param {boolean} includeMinorSection - Whether to include parental consent section
 * @returns {string} Plain text waiver content
 */
export function getPlainTextWaiver(includeMinorSection = false) {
  return getFormattedWaiverText(includeMinorSection)
    .replace(/#{1,6}\s/g, '') // Remove markdown headers
    .replace(/\*\*/g, '') // Remove bold markdown
    .replace(/\*/g, '') // Remove italic markdown
    .replace(/---/g, '═══════════════════════════════════════') // Replace horizontal rules
    .replace(/☐/g, '[ ]'); // Replace checkboxes
}

/**
 * Get waiver sections as individual objects
 * Useful for rendering sections separately in UI
 * 
 * @returns {Array} Array of waiver section objects
 */
export function getWaiverSections() {
  return [
    { id: 'introduction', ...waiverContent.introduction },
    { id: 'assumptionOfRisk', ...waiverContent.assumptionOfRisk },
    { id: 'releaseOfLiability', ...waiverContent.releaseOfLiability },
    { id: 'medicalFitness', ...waiverContent.medicalFitness },
    { id: 'equipmentResponsibility', ...waiverContent.equipmentResponsibility },
    { id: 'photoVideoConsent', ...waiverContent.photoVideoConsent },
    { id: 'emergencyContactAuthorization', ...waiverContent.emergencyContactAuthorization },
    { id: 'parentalConsent', ...waiverContent.parentalConsent },
    { id: 'additionalTerms', ...waiverContent.additionalTerms },
    { id: 'signatureSection', ...waiverContent.signatureSection },
  ];
}

/**
 * Get checkboxes/acknowledgments required for waiver
 * Used in UI to display required checkboxes before signature
 * 
 * @param {boolean} isMinor - Whether participant is a minor
 * @returns {Array} Array of checkbox objects
 */
export function getRequiredAcknowledgments(isMinor = false) {
  const acknowledgments = [
    {
      id: 'risks',
      label: 'I understand and accept the risks of water sports as described in this waiver',
      required: true,
    },
    {
      id: 'liability',
      label: 'I release the company from all liability and agree not to sue for injuries',
      required: true,
    },
    {
      id: 'medical',
      label: 'I declare that I am medically fit to participate and have disclosed all relevant health information',
      required: true,
    },
    {
      id: 'instructions',
      label: 'I agree to follow all safety instructions and directions from company staff',
      required: true,
    },
    {
      id: 'emergency',
      label: 'I authorize emergency medical treatment if needed',
      required: true,
    },
    {
      id: 'photoVideo',
      label: 'I consent to being photographed or filmed during activities (optional)',
      required: false,
    },
  ];

  if (isMinor) {
    acknowledgments.push({
      id: 'parentalConsent',
      label: 'I am the legal parent/guardian and accept full responsibility for the minor participant',
      required: true,
    });
  }

  return acknowledgments;
}

export default {
  waiverContent,
  WAIVER_VERSION,
  WAIVER_LANGUAGE,
  EFFECTIVE_DATE,
  COMPANY_NAME,
  getFormattedWaiverText,
  getPlainTextWaiver,
  getWaiverSections,
  getRequiredAcknowledgments,
};
