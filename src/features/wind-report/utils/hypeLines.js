// Speed-tiered "hype" one-liners for the live wind hero.
//
// The plain verdict (windReport.live.verdict.*) always states the go/no-go +
// skill guidance. On top of THAT, once the live average is genuinely rideable
// we add a rotating hype line to match the stoke on the beach. Below the
// threshold we stay quiet — a flat/light day carries itself with the verdict
// alone and doesn't need a hype man shouting over dead air.
//
// Kept as English copy on purpose: kitesurf hype is an English-first dialect
// ("send it", "nuking", "boost", "megaloops") and these punchy lines lose their
// spark in literal translation. The functional verdict/labels stay fully i18n'd.

export const HYPE_MIN_KTS = 15;

// Non-overlapping speed bands (knots). Each carries its own escalating mood:
//   15–19  → session's ON, come ride (stoke building)
//   19–25  → it's cranking, send it (adrenaline)
//   25–30  → nuking, experts only (respect + hype)
//   30+    → off the charts (survival-mode spectacle)
const TIERS = [
  {
    min: 15,
    max: 19,
    lines: [
      "Wind's pumping — are you here yet?",
      "It's ON. Drop everything and get to the beach.",
      'Green light, riders — the bay is alive.',
      "Clean 15+ rolling in. Rig up and get wet!",
      "This is your sign. Go ride.",
      "The wind gods showed up — did you?",
      "Session's live and kites are already in the sky.",
      "Perfectly powered riding out there right now.",
      "Steady pump on the water — pure fun zone.",
      "If you're reading this, you're not riding. Fix that.",
      "Boardshorts weather with proper wind. Let's go.",
      "The bay's lighting up — get on it.",
      "Cruisy, powered and glassy. Textbook session.",
      "Wind's filling in nicely. Grab your gear.",
      "Prime time at Gülbahçe — don't miss it.",
      "This is what you waited all week for.",
      "Sweet-spot wind: enough to send, chill enough to smile.",
      "Kites are up, stoke is high. Where are you?",
      "Fully powered and feeling good. Get out here.",
      "The wind is calling. Answer it.",
    ],
  },
  {
    min: 19,
    max: 25,
    lines: [
      "It's CRANKING. Send it! 🚀",
      "Boost time — the wind's got hops today.",
      "Size down and hold on — this is the good stuff.",
      "Big-air weather. Go get vertical.",
      "The bay's firing on all cylinders.",
      "Loaded and lit — megaloops on tap.",
      "It's send-o'clock. No excuses.",
      "Wind's honking. Time to get sent.",
      "Full power, full send. Let's goooo.",
      "Rip it, boost it, stick it — it's ON ON.",
      "Proper strong wind — kite of the day is small.",
      "The kind of day legends are made of.",
      "Adrenaline delivery service: now open.",
      "Hooked in and holding on — pure fire.",
      "This wind means business. So should you.",
      "The sky's about to get busy. Go claim your air.",
      "Cranking clean lines across the whole bay.",
      "If your kite isn't small, you're overpowered. Send anyway.",
      "Peak stoke incoming — this is THE session.",
      "Wind's screaming your name. Go answer it, loud.",
    ],
  },
  {
    min: 25,
    max: 30,
    lines: [
      "It's NUKING. Experts only — respect the bay. ⚠️",
      "Full send or full sit-out. Know your limits.",
      "The bay's a washing machine — small kite, big skills.",
      "Nuclear wind. Only the brave (and rigged right).",
      "This one's heavy. Hold on for dear life.",
      "Storm-force fun for the fearless.",
      "Tiny kites, massive stoke, zero chill.",
      "It's absolutely honking out there. Be smart.",
      "Send it if you dare — this one bites.",
      "Overpowered paradise for the pros.",
      "The wind's gone feral. Choose your kite wisely.",
      "Not a drill — this is proper nuking.",
      "Big-boys' wind. Rig tiny or watch from shore.",
      "Maxed out and menacing. Respect it.",
      "This is the deep end. Swim only if you can.",
      "Cranking past sane — legends and lunatics only.",
      "The bay is roaring. Answer only if you're ready.",
      "Full-on nuke session. Safety first, sends second.",
      "Wind this strong writes its own rules.",
      "Hold everything — it's absolutely lit out there.",
    ],
  },
  {
    min: 30,
    max: Infinity,
    lines: [
      "Off the charts — 30+ knots is survival mode. 🌪️",
      "The wind broke the scale. Watch from the beach.",
      "This isn't a session, it's a spectacle.",
      "Certified nuking — even the pros are humble today.",
      "Mother Nature is showing off. Stay safe.",
      "30+ and climbing — respect or retreat.",
      'This is what "too much of a good thing" looks like.',
      "The bay is untamed today. Enjoy the show.",
      "Gale-force glory, for the truly wild only.",
      "When it hits 30, legends are born or humbled.",
      "Anchored kites and wide eyes — it's biblical out there.",
      "Beyond redline. Beach beers over boosts today.",
    ],
  },
];

/**
 * Pick a hype line for the current live average.
 * @param {number} kts  live average wind speed in knots
 * @param {number} seed deterministic rotation seed — pass the reading's epoch
 *                      (live.unixtime) so the line is STABLE for a given reading
 *                      (no flicker on re-render) yet advances when a fresh
 *                      reading lands.
 * @returns {string|null} the line, or null below HYPE_MIN_KTS (stay quiet).
 */
export const getHypeLine = (kts, seed = 0) => {
  if (!Number.isFinite(kts) || kts < HYPE_MIN_KTS) return null;
  const tier = TIERS.find((tr) => kts >= tr.min && kts < tr.max) || TIERS[TIERS.length - 1];
  const s = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) : 0;
  return tier.lines[s % tier.lines.length];
};
