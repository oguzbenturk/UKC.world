/**
 * Inject new super-agent tool nodes into kai-optimized.json
 * Run: node scripts/inject-kai-tools.cjs
 */
const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', 'kai-optimized.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));

const newTools = [
  // RENTALS
  { id: 'rentals-mine', name: 'get_my_rentals', desc: 'Get user rental history. Returns rental dates, status, price.', method: 'GET', path: 'rentals/mine', roles: ['cust','admin'], query: [{ n: 'customerId', p: 'modelOptional', d: 'Customer UUID (admin only)', t: 'string' }] },
  { id: 'rental-detail', name: 'get_rental_detail', desc: 'Get details of a specific rental. Required: rentalId.', method: 'GET', path: 'rentals/{rentalId}', roles: ['cust','admin'], ph: [{ n: 'rentalId', d: 'Rental UUID', t: 'string' }] },

  // PROGRESS
  { id: 'student-progress', name: 'get_student_progress', desc: 'Get student progress: total lessons, completed, avg rating. Required: studentId.', method: 'GET', path: 'progress/{studentId}', roles: ['cust','staff','admin'], ph: [{ n: 'studentId', d: 'Student UUID', t: 'string' }] },
  { id: 'booking-feedback', name: 'get_booking_feedback', desc: 'Get feedback/rating for a booking. Required: bookingId.', method: 'GET', path: 'feedback/{bookingId}', roles: ['cust','staff','admin'], ph: [{ n: 'bookingId', d: 'Booking UUID', t: 'string' }] },

  // FAMILY
  { id: 'family-list', name: 'get_family', desc: 'Get family members: name, DOB, relationship, medical notes.', method: 'GET', path: 'family', roles: ['cust','admin'], query: [{ n: 'userId', p: 'modelOptional', d: 'User UUID (admin only)', t: 'string' }] },
  { id: 'family-add', name: 'add_family_member', desc: 'Add family member. ONLY after confirm. Required: fullName, dateOfBirth (YYYY-MM-DD), relationship. Optional: gender, medicalNotes, emergencyContact.', method: 'POST', path: 'family', roles: ['cust','admin'], body: [
    { n: 'fullName', p: 'modelRequired', d: 'Full name', t: 'string' },
    { n: 'dateOfBirth', p: 'modelRequired', d: 'YYYY-MM-DD', t: 'string' },
    { n: 'relationship', p: 'modelRequired', d: 'child/spouse/sibling/parent', t: 'string' },
    { n: 'gender', p: 'modelOptional', d: 'male/female/other', t: 'string' },
    { n: 'medicalNotes', p: 'modelOptional', d: 'Medical info', t: 'string' },
    { n: 'emergencyContact', p: 'modelOptional', d: 'Phone', t: 'string' },
  ] },

  // SHOP
  { id: 'products', name: 'get_products', desc: 'Browse product catalog. Optional: category, search.', method: 'GET', path: 'products', roles: ['pub','cust','admin'], query: [
    { n: 'category', p: 'modelOptional', d: 'Product category', t: 'string' },
    { n: 'search', p: 'modelOptional', d: 'Search keyword', t: 'string' },
  ] },
  { id: 'product-detail', name: 'get_product_detail', desc: 'Get product details: sizes, colors, variants, stock. Required: productId.', method: 'GET', path: 'products/{productId}', roles: ['pub','cust','admin'], ph: [{ n: 'productId', d: 'Product UUID', t: 'string' }] },
  { id: 'shop-orders-mine', name: 'get_my_orders', desc: 'Get user shop order history with items, status, totals.', method: 'GET', path: 'shop-orders/mine', roles: ['cust','admin'], query: [{ n: 'customerId', p: 'modelOptional', d: 'Customer UUID (admin only)', t: 'string' }] },
  { id: 'create-shop-order', name: 'create_shop_order', desc: 'Create a shop order. ONLY after confirm. Required: items (JSON array [{productId,quantity}]). Optional: notes.', method: 'POST', path: 'shop-orders', roles: ['cust','admin'], body: [
    { n: 'items', p: 'modelRequired', d: 'JSON array [{productId: UUID, quantity: number}]', t: 'string' },
    { n: 'notes', p: 'modelOptional', d: 'Order notes', t: 'string' },
  ] },

  // GROUP LESSONS
  { id: 'group-requests-mine', name: 'get_my_group_requests', desc: 'Get user group lesson requests with status.', method: 'GET', path: 'group-lesson-requests/mine', roles: ['cust','admin'] },
  { id: 'create-group-request', name: 'create_group_lesson_request', desc: 'Submit group lesson request. Required: serviceId, preferredDateStart (YYYY-MM-DD). Optional: preferredDateEnd, preferredTimeOfDay, skillLevel, notes.', method: 'POST', path: 'group-lesson-requests', roles: ['cust','admin'], body: [
    { n: 'serviceId', p: 'modelRequired', d: 'Service UUID', t: 'string' },
    { n: 'preferredDateStart', p: 'modelRequired', d: 'YYYY-MM-DD', t: 'string' },
    { n: 'preferredDateEnd', p: 'modelOptional', d: 'YYYY-MM-DD end date', t: 'string' },
    { n: 'preferredTimeOfDay', p: 'modelOptional', d: 'morning/afternoon/evening/any', t: 'string' },
    { n: 'skillLevel', p: 'modelOptional', d: 'beginner/intermediate/advanced', t: 'string' },
    { n: 'notes', p: 'modelOptional', d: 'Special requests', t: 'string' },
  ] },

  // FEEDBACK
  { id: 'submit-feedback', name: 'submit_feedback', desc: 'Submit lesson feedback. ONLY after confirm. Required: bookingId, rating (1-5). Optional: comment.', method: 'POST', path: 'feedback', roles: ['cust'], body: [
    { n: 'bookingId', p: 'modelRequired', d: 'Booking UUID', t: 'string' },
    { n: 'rating', p: 'modelRequired', d: '1-5', t: 'number' },
    { n: 'comment', p: 'modelOptional', d: 'Feedback text', t: 'string' },
  ] },
  { id: 'instructor-ratings', name: 'get_instructor_ratings', desc: 'Get instructor rating summary and breakdown. Required: instructorId.', method: 'GET', path: 'instructor-ratings/{instructorId}', roles: ['pub','cust','staff','admin'], ph: [{ n: 'instructorId', d: 'Instructor UUID', t: 'string' }] },

  // WAIVERS
  { id: 'waiver-status', name: 'get_waiver_status', desc: 'Check waiver status for user and family. Shows who signed and who needs to.', method: 'GET', path: 'waivers/status', roles: ['cust','admin'] },

  // INSTRUCTOR SKILLS
  { id: 'instructors-by-skill', name: 'get_instructors_by_skill', desc: 'Find instructors by discipline and level. Required: discipline (kite/wing/kite_foil/efoil/premium). Optional: level.', method: 'GET', path: 'instructors/by-skill', roles: ['pub','cust','staff','admin'], query: [
    { n: 'discipline', p: 'modelRequired', d: 'kite/wing/kite_foil/efoil/premium', t: 'string' },
    { n: 'level', p: 'modelOptional', d: 'beginner/intermediate/advanced', t: 'string' },
  ] },

  // INSTRUCTOR RECOMMENDATION
  { id: 'recommend-instructor', name: 'recommend_instructor', desc: 'Get top 3 instructor recommendations by skill, rating, availability. Required: discipline. Optional: level, date.', method: 'GET', path: 'instructors/recommend', roles: ['cust','admin'], query: [
    { n: 'discipline', p: 'modelRequired', d: 'kite/wing/kite_foil/efoil/premium', t: 'string' },
    { n: 'level', p: 'modelOptional', d: 'beginner/intermediate/advanced', t: 'string' },
    { n: 'date', p: 'modelOptional', d: 'YYYY-MM-DD', t: 'string' },
  ] },
];

const roleMap = {
  pub: 'AI Agent Public',
  cust: 'AI Agent Customer',
  staff: 'AI Agent Staff',
  admin: 'AI Agent Admin',
};

const stdHeaders = [
  { name: 'X-Kai-Agent-Secret', valueProvider: 'fieldValue', value: '={{ $env.KAI_AGENT_SECRET }}' },
  { name: 'X-Requesting-User-Id', valueProvider: 'fieldValue', value: "={{ $('Webhook Trigger').item.json.body.userId }}" },
  { name: 'X-Requesting-User-Role', valueProvider: 'fieldValue', value: "={{ $('Webhook Trigger').item.json.body.userRole }}" },
];

let added = 0;

for (const tool of newTools) {
  for (const role of tool.roles) {
    const nodeId = `${role}-${tool.id}`;
    const nodeName = `${role}_${tool.name}`;
    const agentName = roleMap[role];

    // Skip if already exists
    if (workflow.nodes.some(n => n.name === nodeName)) continue;

    const params = {
      name: tool.name,
      description: tool.desc,
      method: tool.method,
      url: `={{ $env.PLANNIVO_API_BASE }}/${tool.path}`,
      sendHeaders: true,
      optimizeResponse: true,
      specifyHeaders: 'keypair',
      parametersHeaders: { values: [...stdHeaders] },
    };

    if (tool.method === 'POST') {
      params.parametersHeaders.values.push({ name: 'Content-Type', valueProvider: 'fieldValue', value: 'application/json' });
      params.sendBody = true;
    }

    const allPh = [];

    if (tool.query) {
      params.sendQuery = true;
      params.specifyQuery = 'keypair';
      params.parametersQuery = { values: tool.query.map(q => ({ name: q.n, valueProvider: q.p })) };
      tool.query.forEach(q => allPh.push({ name: q.n, description: q.d, type: q.t }));
    }

    if (tool.body) {
      params.specifyBody = 'keypair';
      params.parametersBody = { values: tool.body.map(b => ({ name: b.n, valueProvider: b.p })) };
      tool.body.forEach(b => allPh.push({ name: b.n, description: b.d, type: b.t }));
    }

    if (tool.ph) {
      tool.ph.forEach(p => allPh.push({ name: p.n, description: p.d, type: p.t }));
    }

    if (allPh.length > 0) {
      params.placeholderDefinitions = { values: allPh };
    }

    const yPos = { pub: 100, cust: 380, staff: 780, admin: 1180 };

    workflow.nodes.push({
      parameters: params,
      id: nodeId,
      name: nodeName,
      type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
      typeVersion: 1.1,
      position: [1500 + added * 15, yPos[role]],
      onError: 'continueRegularOutput',
    });

    workflow.connections[nodeName] = {
      ai_tool: [[{ node: agentName, type: 'ai_tool', index: 0 }]],
    };

    added++;
  }
}

fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2));
console.log(`Done: added ${added} tool nodes with connections.`);
