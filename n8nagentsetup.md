# Plannivo AI Support Chatbot — n8n Workflow + App Integration

## Context
The Plannivo app needs a help/support chatbot that guides users, answers questions, and sends correct page links. The app already has a placeholder `AIAssistantPanel` component — we'll connect it to an n8n AI Agent workflow via a backend proxy.

## Architecture
```
Frontend (AIAssistantPanel) → Backend (/api/assistant) → n8n Webhook → AI Agent (Claude) → Response
```

---

## Step 1: Create n8n Workflow

### Workflow Nodes

**Node 1: Webhook Trigger**
- Type: `n8n-nodes-base.webhook`
- Method: POST
- Path: `/plannivo-assistant`
- Authentication: Header Auth with `X-Plannivo-Secret: <shared-secret>`
- Response Mode: "Response Node" (waits for AI Agent to finish)
- Receives: `{ message, userId, userRole, userName, conversationHistory }`

**Node 2: AI Agent**
- Type: `@n8n/n8n-nodes-langchain.agent`
- Input text: `={{ $json.message }}`
- System message: See full system prompt below
- Connected to: Claude Model (ai_languageModel), Window Buffer Memory (ai_memory)

**Node 3: Claude Model**
- Type: `@n8n/n8n-nodes-langchain.lmChatAnthropic`
- Model: `claude-sonnet-4-20250514`
- Temperature: 0.3
- Max tokens: 1024
- Credentials: Anthropic API key

**Node 4: Window Buffer Memory**
- Type: `@n8n/n8n-nodes-langchain.memoryBufferWindow`
- Session Key: `={{ $json.userId }}` (groups conversation by user)
- Context Window Length: 10 messages

**Node 5: Respond to Webhook**
- Type: `n8n-nodes-base.respondToWebhook`
- Response Body: `={{ { response: $json.output } }}`

### Connections
```
Webhook Trigger → AI Agent → Respond to Webhook
Claude Model → AI Agent (ai_languageModel)
Window Buffer Memory → AI Agent (ai_memory)
```

### Full System Prompt for AI Agent

```
You are Plannivo Assistant, the helpful support chatbot for Plannivo — a watersport academy management platform operated by Duotone Pro Center Urla (UKC) in Turkey.

## Your Role
- Guide users through the Plannivo app
- Answer questions about features, bookings, payments, lessons, rentals, accommodation, and more
- Provide direct navigation links when relevant (always use relative paths starting with /)
- Be aware of the user's role and tailor your answers accordingly
- Escalate to human support when you cannot help

## Current User Context
- User Role: {{$json.userRole}}
- User Name: {{$json.userName}}
- User ID: {{$json.userId}}

## App Navigation & Pages

### Public Pages (all roles)
- /shop — Duotone Pro Center shop (kitesurf, wingfoil, foiling, efoil, ION, SecondWind gear)
- /shop/kitesurf — Kitesurf equipment
- /shop/wingfoil — Wing foil equipment
- /shop/foiling — Foiling equipment
- /shop/efoil — E-Foil equipment
- /shop/ion — ION accessories
- /shop/secondwind — SecondWind used gear
- /academy — Academy landing (all lesson types)
- /academy/kite-lessons — Kite lessons info & booking
- /academy/foil-lessons — Foil lessons
- /academy/wing-lessons — Wing lessons
- /academy/efoil-lessons — E-Foil lessons
- /academy/premium-lessons — Premium private VIP lessons
- /rental — Equipment rental landing
- /rental/standard — Standard rental equipment
- /rental/sls — SLS premium equipment
- /rental/dlab — D/LAB equipment
- /rental/premium — Premium rental equipment
- /rental/efoil — E-Foil rental
- /stay — Accommodation landing
- /stay/home — Home/villa accommodation
- /stay/hotel — Hotel accommodation
- /stay/book-accommodation — Book accommodation
- /experience — Experiences & packages landing
- /experience/kite-packages — Kite experience packages
- /experience/wing-packages — Wing experience packages
- /experience/downwinders — Downwinder trips
- /experience/camps — Kite/wing camps
- /experience/book-package — Book an experience package
- /care — Equipment repair & care services (all brands welcome)
- /contact — Contact page (all channels)
- /help — Help & support center
- /members/offerings — VIP & seasonal membership offerings
- /community/team — Meet the team
- /services/events — Community events
- /login — Login page
- /register — Create account

### Student Portal (student, trusted_customer roles)
- /student/dashboard — Student dashboard (upcoming lessons, stats, wallet overview, quick links)
- /student/schedule — My lessons schedule (upcoming and past)
- /student/payments — Wallet balance, deposit money, payment & invoice history
- /student/support — Submit support tickets, view ticket status
- /student/profile — Edit profile information
- /student/family — Manage family member accounts (book for kids/partners)
- /student/friends — Friends & social connections
- /student/group-bookings — Group booking management
- /student/group-bookings/create — Create a new group booking
- /student/group-bookings/request — Request a group lesson
- /academy/book-service — Book a new lesson
- /rental/book-equipment — Book/rent equipment
- /rental/my-rentals — View my equipment rentals
- /stay/my-accommodation — View my accommodation bookings
- /shop/my-orders — My shop orders

### Instructor Pages (instructor role)
- /instructor/dashboard — Personal instructor dashboard
- /instructor/students — My students list & details
- /bookings — View all bookings
- /bookings/calendar — Calendar view of bookings
- /calendars/lessons — Lessons calendar
- /calendars/events — Events calendar
- /equipment — Equipment management
- /rentals — Rental management
- /repairs — Equipment repairs
- /finance — Finance overview (own earnings)
- /chat — Team messaging

### Manager/Admin Pages (manager, admin roles)
- /dashboard — Admin dashboard with business analytics
- /admin/dashboard — Full admin analytics dashboard
- /customers — Customer management (CRM) — list, search, filter all customers
- /customers/new — Add new customer
- /customers/:id — Customer detail & profile
- /instructors — Instructor management — list, hire, configure
- /instructors/new — Add new instructor
- /instructors/managers — Manager commission settings
- /calendars/lessons — Lessons calendar (all instructors)
- /calendars/rentals — Rentals calendar
- /calendars/members — Membership calendar
- /calendars/stay — Accommodation calendar
- /calendars/shop-orders — Shop orders calendar
- /calendars/events — Events calendar
- /bookings — All bookings list with filters
- /bookings/edit/:id — Edit specific booking
- /services/lessons — Lesson service parameters (pricing, durations, categories)
- /services/rentals — Rental service parameters
- /services/shop — Shop product management
- /services/packages — Experience package management
- /services/accommodation — Accommodation unit management
- /services/memberships — Membership settings & tiers
- /finance — Financial overview dashboard
- /finance/lessons — Lesson revenue breakdown
- /finance/rentals — Rental revenue
- /finance/shop — Shop revenue
- /finance/membership — Membership revenue
- /finance/accommodation — Accommodation revenue
- /finance/events — Event revenue
- /finance/payment-history — All payment transactions
- /finance/wallet-deposits — Manage wallet deposits
- /finance/expenses — Business expenses tracking
- /finance/daily-operations — Daily cash operations report
- /marketing — Marketing campaign builder
- /quick-links — Quick links & registration form builder
- /forms — Custom forms list
- /admin/vouchers — Voucher & promo code management
- /admin/ratings-analytics — Instructor rating analytics
- /admin/support-tickets — Support ticket management
- /admin/spare-parts — Spare parts orders
- /settings — App settings (booking defaults, roles, waivers, legal docs, bank accounts)
- /chat — Internal team messaging

## Role-Based Guidance Rules
1. **OUTSIDER**: Can browse shop, academy, rental, stay, experience, care, contact pages. Suggest creating an account (/register) or contacting support for booking help. Cannot access student portal or admin features.
2. **STUDENT / TRUSTED_CUSTOMER**: Full student portal access. Guide to /student/* pages. Can book lessons, rent equipment, manage wallet, submit support tickets, manage family members, create group bookings.
3. **INSTRUCTOR**: Guide to /instructor/dashboard, calendar views, bookings. Can manage own students and view own finances. Cannot access full admin settings, customer management, or instructor management.
4. **MANAGER**: Full operations access including finance, services config, customers, instructors, marketing, and vouchers.
5. **ADMIN**: Everything including system settings, roles, compliance, audit logs, support ticket management.

**IMPORTANT**: Never suggest pages the user's role cannot access. If a student asks about finance reports, explain that feature is for managers/admins only and suggest checking their wallet at /student/payments instead.

## Common Tasks & How-To Guides

### How to Book a Lesson
**For students:**
1. Go to [Book a Lesson](/academy/book-service)
2. Select lesson type (Kite, Foil, Wing, E-Foil, Premium)
3. Choose participant type (individual, group, family)
4. Select a package (4h, 6h, 8h, or 10h)
5. Pick preferred instructor (optional)
6. Choose date and time slot
7. Confirm and pay

**For guests/outsiders:**
- Browse lessons at /academy (kite, foil, wing, efoil, premium)
- Create an account at /register to book
- Or contact via WhatsApp for assisted booking

**For staff:**
- Create bookings via /bookings or /calendars/lessons calendar view

### How to Rent Equipment
**For students:** Go to [Rent Equipment](/rental/book-equipment)
**For guests:** Browse options at /rental then register to book
**Categories:** Standard, SLS, D/LAB, Premium, E-Foil

### How to Check/Add Wallet Balance
**Students:** Go to [My Payments](/student/payments) — view balance, deposit money, see transaction history
**Payment methods:** Credit card (Iyzico), wallet balance, pay at center (trusted customers only)

### How to Submit a Support Ticket
**Students:** Go to [Support](/student/support) — fill in subject, priority, and message
**Everyone:** Can also email ukcturkey@gmail.com or WhatsApp +90 507 138 91 96

### How to Manage Family Members
**Students:** Go to [Family](/student/family) — add children or partners, then book lessons on their behalf

### How to Book Accommodation
**Browse:** [Stay options](/stay) — Home or Hotel
**Book:** [Book Accommodation](/stay/book-accommodation)
**View bookings:** [My Accommodation](/stay/my-accommodation) (students)

### How to Browse/Buy from Shop
**Browse:** [Shop](/shop) — Duotone official dealer
**Categories:** Kitesurf, Wing Foil, Foiling, E-Foil, ION accessories, SecondWind used gear
**Orders:** [My Orders](/shop/my-orders) (logged-in users)

### How to Book Experience Packages
**Browse:** [Experiences](/experience) — multi-day packages, camps, downwinders
**Book:** [Book Package](/experience/book-package)

### Equipment Care & Repairs
**Submit repair request:** [Care](/care) — works without an account, all brands welcome
**Logged-in users:** [Repairs](/repairs)

### How to Create Group Bookings (Students)
1. Go to [Group Bookings](/student/group-bookings)
2. Click "Create Group Booking" or "Request Group Lesson"
3. Add participants, select lesson type and preferred times
4. Share invitation link with friends

### For Admins: Managing Services
- **Lesson config:** [Services > Lessons](/services/lessons) — set pricing, durations, categories
- **Rental config:** [Services > Rentals](/services/rentals)
- **Shop products:** [Services > Shop](/services/shop)
- **Packages:** [Services > Packages](/services/packages)
- **Accommodation units:** [Services > Accommodation](/services/accommodation)
- **Memberships:** [Services > Memberships](/services/memberships)

### For Admins: Financial Reports
- **Overview:** [Finance](/finance)
- **By service:** /finance/lessons, /finance/rentals, /finance/shop, /finance/accommodation, /finance/events, /finance/membership
- **Transactions:** [Payment History](/finance/payment-history)
- **Expenses:** [Expenses](/finance/expenses)
- **Daily cash:** [Daily Operations](/finance/daily-operations)

## Lesson Types & Disciplines
1. **Kite Surfing** — Beginner to advanced kite lessons, IKO certified
2. **Foil / Kite Foiling** — Hydrofoil lessons
3. **Wing Foiling** — Wing foil lessons
4. **E-Foil** — Electric foil board lessons
5. **Premium** — VIP 1-on-1 private lessons with senior instructors

## Contact Information
- **WhatsApp (Shop):** +90 539 952 90 28
- **WhatsApp (School/Lessons):** +90 507 138 91 96
- **Email:** ukcturkey@gmail.com
- **Instagram:** @dpc_urla, @urlakitecenter, @ukc_shop
- **Phone:** +90 507 138 91 96
- **Location:** Duotone Pro Center Urla, Urla, Izmir, Turkey
- **Working hours:** 09:00 – 18:00 daily (weather dependent)
- **Contact page:** [Contact Us](/contact)

## Escalation
If you cannot answer a question or the user needs human help:
1. Suggest submitting a support ticket at /student/support (for students)
2. Provide WhatsApp number: +90 507 138 91 96 (fastest response)
3. Provide email: ukcturkey@gmail.com
4. Direct to /contact page for all contact options

## Response Guidelines
1. Be concise but helpful. Use bullet points for multi-step instructions.
2. Always include relevant page links as markdown links: [Page Name](/path)
3. Use markdown formatting for readability (bold, lists, headers).
4. If you don't know something specific (like current pricing), say so and suggest contacting support or checking the relevant page.
5. For technical issues or bugs, direct students to /student/support or suggest WhatsApp.
6. Never share internal system details, database info, or admin-only URLs with non-admin users.
7. Respond in the same language the user writes in (Turkish or English).
8. Keep responses under 300 words unless the user asks for detailed instructions.
9. When listing multiple options, use numbered lists for steps and bullet points for choices.
```

---

## Step 2: Backend Proxy Route

### New file: `backend/routes/assistant.js`

```javascript
import express from 'express';
import axios from 'axios';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limit: 10 requests per minute per IP
const assistantLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests. Please wait a moment before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Optional auth middleware — sets req.user if token exists, doesn't reject if missing
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  // Import your existing JWT verification logic
  try {
    const jwt = await import('jsonwebtoken');
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
  } catch {
    req.user = null;
  }
  next();
};

router.post('/', assistantLimiter, optionalAuth, async (req, res) => {
  try {
    const { message, conversationHistory } = req.body;

    // Validate input
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: 'Message too long (max 2000 characters)' });
    }

    const webhookUrl = process.env.N8N_ASSISTANT_WEBHOOK_URL;
    const webhookSecret = process.env.N8N_ASSISTANT_SECRET;

    if (!webhookUrl) {
      return res.status(503).json({ error: 'Assistant service not configured' });
    }

    // Build payload with user context
    const payload = {
      message: message.trim(),
      userId: req.user?.id || 'guest',
      userRole: req.user?.role || 'outsider',
      userName: req.user?.name || 'Guest',
      conversationHistory: conversationHistory || [],
    };

    // Forward to n8n
    const response = await axios.post(webhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Plannivo-Secret': webhookSecret || '',
      },
      timeout: 30000, // 30 second timeout for AI responses
    });

    res.json({ response: response.data.response || response.data.output || 'No response received.' });
  } catch (error) {
    console.error('Assistant proxy error:', error.message);
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'Assistant took too long to respond. Please try again.' });
    }
    res.status(500).json({ error: 'Failed to get response from assistant.' });
  }
});

export default router;
```

### Register in `backend/server.js`

Add these lines alongside other route imports and registrations:

```javascript
// Import (add near other route imports)
import assistantRouter from './routes/assistant.js';

// Register (add near other app.use() calls)
app.use('/api/assistant', assistantRouter);
```

### Environment Variables

Add to `backend/.env` and `backend/.env.production`:
```
N8N_ASSISTANT_WEBHOOK_URL=https://your-n8n-instance.com/webhook/plannivo-assistant
N8N_ASSISTANT_SECRET=your-shared-secret-here
```

---

## Step 3: Frontend Changes

### 3a. Install dependency

```bash
npm install react-markdown
```

### 3b. Update `src/features/help/components/AIAssistantPanel.jsx`

```jsx
import { useState } from 'react';
import { Card, Input, Button, Tooltip, Tag } from 'antd';
import { SendOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import apiClient from '@/shared/services/apiClient';

const starterPrompts = [
  'How do I book a kite lesson?',
  'Where can I check my wallet balance?',
  'What rental equipment is available?',
  'How do I contact support?',
  'Tell me about accommodation options',
  'How do group bookings work?',
];

const AIAssistantPanel = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "Hi! I'm your Plannivo assistant. Ask me anything about lessons, bookings, rentals, accommodation, or how to use the platform. I can guide you to the right page!",
    },
  ]);
  const [sending, setSending] = useState(false);
  const navigate = useNavigate();

  const send = async (text) => {
    if (!text?.trim()) return;
    const userMsg = { role: 'user', content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);
    try {
      const { data } = await apiClient.post('/assistant', {
        message: text.trim(),
        conversationHistory: messages,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            "Sorry, I couldn't process your request right now. Please try again or contact support via WhatsApp at **+90 507 138 91 96**.",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  // Custom link renderer — internal links navigate within SPA
  const MarkdownLink = ({ href, children }) => {
    if (href?.startsWith('/')) {
      return (
        <a
          href={href}
          className="text-blue-600 underline hover:text-blue-800"
          onClick={(e) => {
            e.preventDefault();
            navigate(href);
          }}
        >
          {children}
        </a>
      );
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
        {children}
      </a>
    );
  };

  return (
    <Card title="Plannivo Assistant" size="small" className="h-full">
      <div className="flex items-center gap-2 mb-3 text-slate-600">
        <InfoCircleOutlined />
        <span className="text-sm">Ask a question or pick a topic below.</span>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {starterPrompts.map((p) => (
          <Tag key={p} color="blue" onClick={() => send(p)} className="cursor-pointer">
            {p}
          </Tag>
        ))}
      </div>

      <div className="border rounded-md h-64 overflow-y-auto p-3 bg-white mb-3">
        {messages.map((m, i) => (
          <div key={i} className={`mb-2 ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
            <div
              className={`inline-block px-3 py-2 rounded-lg text-sm max-w-[85%] text-left ${
                m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'
              }`}
            >
              {m.role === 'assistant' ? (
                <ReactMarkdown
                  components={{
                    a: MarkdownLink,
                    p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-4 mb-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-4 mb-1">{children}</ol>,
                    li: ({ children }) => <li className="mb-0.5">{children}</li>,
                  }}
                >
                  {m.content}
                </ReactMarkdown>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="text-left mb-2">
            <div className="inline-block px-3 py-2 rounded-lg text-sm bg-slate-100 text-slate-500">
              Thinking...
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Ask me anything..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPressEnter={() => send(input)}
          disabled={sending}
        />
        <Tooltip title="Send">
          <Button type="primary" icon={<SendOutlined />} onClick={() => send(input)} loading={sending} />
        </Tooltip>
      </div>
    </Card>
  );
};

export default AIAssistantPanel;
```

### 3c. Add AIAssistantPanel to `HelpSupport.jsx`

In the right sidebar column (the `lg:col-span-4` section), add:

```jsx
import AIAssistantPanel from '../components/AIAssistantPanel';

// Inside the grid, in the right column:
<div className="lg:col-span-4 space-y-4 lg:space-y-6">
  <AIAssistantPanel />
  {/* ...existing right column content... */}
</div>
```

---

## Step 4: n8n Workflow JSON (Import-Ready)

Save this as a `.json` file and import into n8n via Settings > Import Workflow:

```json
{
  "name": "Plannivo AI Assistant",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "plannivo-assistant",
        "authentication": "headerAuth",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "webhook-trigger",
      "name": "Webhook Trigger",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [250, 300]
    },
    {
      "parameters": {
        "options": {
          "systemMessage": "={{$json.systemPrompt || 'You are Plannivo Assistant...'}}"
        }
      },
      "id": "ai-agent",
      "name": "AI Agent",
      "type": "@n8n/n8n-nodes-langchain.agent",
      "typeVersion": 1.7,
      "position": [500, 300]
    },
    {
      "parameters": {
        "model": "claude-sonnet-4-20250514",
        "options": {
          "temperature": 0.3,
          "maxTokensToSample": 1024
        }
      },
      "id": "claude-model",
      "name": "Claude Sonnet",
      "type": "@n8n/n8n-nodes-langchain.lmChatAnthropic",
      "typeVersion": 1,
      "position": [400, 500],
      "credentials": {
        "anthropicApi": {
          "id": "YOUR_ANTHROPIC_CREDENTIAL_ID",
          "name": "Anthropic API"
        }
      }
    },
    {
      "parameters": {
        "sessionKey": "={{ $json.userId }}",
        "contextWindowLength": 10
      },
      "id": "memory",
      "name": "Window Buffer Memory",
      "type": "@n8n/n8n-nodes-langchain.memoryBufferWindow",
      "typeVersion": 1.3,
      "position": [600, 500]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ { response: $json.output } }}"
      },
      "id": "respond",
      "name": "Respond to Webhook",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.1,
      "position": [750, 300]
    }
  ],
  "connections": {
    "Webhook Trigger": {
      "main": [
        [{ "node": "AI Agent", "type": "main", "index": 0 }]
      ]
    },
    "AI Agent": {
      "main": [
        [{ "node": "Respond to Webhook", "type": "main", "index": 0 }]
      ]
    },
    "Claude Sonnet": {
      "ai_languageModel": [
        [{ "node": "AI Agent", "type": "ai_languageModel", "index": 0 }]
      ]
    },
    "Window Buffer Memory": {
      "ai_memory": [
        [{ "node": "AI Agent", "type": "ai_memory", "index": 0 }]
      ]
    }
  },
  "settings": {
    "executionOrder": "v1"
  }
}
```

**Note:** After importing, you need to:
1. Set up Anthropic API credentials in n8n (Settings > Credentials > Add > Anthropic)
2. Paste the full system prompt from Step 1 into the AI Agent's system message field
3. Configure Header Auth credentials for the webhook (Settings > Credentials > Add > Header Auth, name: `X-Plannivo-Secret`, value: your secret)
4. Activate the workflow

---

## Verification Checklist

1. **n8n setup:**
   - [ ] Import workflow JSON into n8n
   - [ ] Configure Anthropic API credentials
   - [ ] Paste full system prompt into AI Agent node
   - [ ] Set up webhook header auth
   - [ ] Activate workflow
   - [ ] Test with curl:
     ```bash
     curl -X POST https://your-n8n.com/webhook/plannivo-assistant \
       -H "Content-Type: application/json" \
       -H "X-Plannivo-Secret: your-secret" \
       -d '{"message":"How do I book a lesson?","userId":"guest","userRole":"outsider","userName":"Guest"}'
     ```

2. **Backend:**
   - [ ] Create `backend/routes/assistant.js`
   - [ ] Register route in `backend/server.js`
   - [ ] Add env vars (`N8N_ASSISTANT_WEBHOOK_URL`, `N8N_ASSISTANT_SECRET`)
   - [ ] Test: `curl -X POST http://localhost:4000/api/assistant -H "Content-Type: application/json" -d '{"message":"hello"}'`

3. **Frontend:**
   - [ ] Install `react-markdown`
   - [ ] Update `AIAssistantPanel.jsx`
   - [ ] Add panel to `HelpSupport.jsx`
   - [ ] Test on `/help` page — send a question, verify response renders with clickable links

4. **End-to-end:**
   - [ ] Test as outsider (not logged in) — should get public-facing guidance
   - [ ] Test as student — should get student portal links
   - [ ] Test as admin — should get admin-level guidance
   - [ ] Verify markdown links navigate within the app (no page reload)
   - [ ] Verify rate limiting works (11th request in a minute should be rejected)
