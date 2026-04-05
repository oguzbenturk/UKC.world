-- Migration: 025_seed_default_waiver.sql
-- Description: Seeds the default international standard kitesurfing liability waiver

-- Deactivate any existing active waivers to ensure only our new one is active
UPDATE waiver_versions SET is_active = false WHERE is_active = true;

-- Insert the new standard waiver
INSERT INTO waiver_versions (
    version_number, 
    language_code, 
    content, 
    is_active, 
    effective_date
) VALUES (
    '1.0-STD', 
    'en', 
    '<h2>Student Liability Waiver & Release of Liability</h2>
    <p><strong>PLEASE READ CAREFULLY BEFORE SIGNING. THIS IS A LEGALLY BINDING DOCUMENT.</strong></p>
    
    <h3>1. ASSUMPTION OF RISK</h3>
    <p>I acknowledge that Kitesurfing/Kiteboarding is an extreme sport that involves inherent risks, including but not limited to: collision with other participants, boats, or objects; equipment failure; adverse weather conditions; strong winds; currents; and waves. I voluntarily assume all such risks, known and unknown, even if arising from the negligence of the releasees or others.</p>
    
    <h3>2. MEDICAL CERTIFICATION</h3>
    <p>I certify that I am physically fit, have no heart conditions, can swim in open water for at least 15 minutes unassisted, and have no medical contraindications to participating in strenuous water sports activities.</p>
    
    <h3>3. RELEASE OF LIABILITY</h3>
    <p>In consideration of being allowed to participate in activities and use the facilities and equipment of the School/Center, I hereby release, waive, and discharge the School, its instructors, employees, and agents from all liability to myself, my personal representatives, assigns, heirs, and next of kin for any and all loss or damage, and any claim or demands therefor on account of injury to the person or property or resulting in death of the undersigned, whether caused by the negligence of the releasees or otherwise.</p>
    
    <h3>4. EQUIPMENT RESPONSIBILITY</h3>
    <p>I agree to use all equipment properly and follow all safety instructions. I accept full financial responsibility for any damage to or loss of equipment assigned to me caused by my negligence or failure to follow instructions.</p>
    
    <h3>5. MEDIA RELEASE</h3>
    <p>I grant the School permission to use photographs and/or video recordings of me taken during the activity for marketing and promotional purposes without compensation.</p>
    
    <p><strong>I HAVE READ THIS RELEASE OF LIABILITY AND ASSUMPTION OF RISK AGREEMENT, FULLY UNDERSTAND ITS TERMS, UNDERSTAND THAT I HAVE GIVEN UP SUBSTANTIAL RIGHTS BY SIGNING IT, AND SIGN IT FREELY AND VOLUNTARILY WITHOUT ANY INDUCEMENT.</strong></p>',
    true,
    CURRENT_DATE
)
ON CONFLICT (version_number, language_code) 
DO UPDATE SET 
    content = EXCLUDED.content,
    is_active = true,
    effective_date = EXCLUDED.effective_date;
