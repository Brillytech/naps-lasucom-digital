// Money is integer kobo everywhere it is stored or sent; naira only on screen.

export function formatNaira(kobo) {
  const value = Number(kobo || 0) / 100;
  return (
    "₦" +
    value.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

// "5,000" / "5000.5" / "₦5,000.50" -> 500050. Returns null for anything that
// is not a positive amount with at most two decimal places.
export function parseNairaToKobo(input) {
  const cleaned = String(input || "").replace(/[₦,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const kobo = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(kobo) && kobo > 0 ? kobo : null;
}

// Plain number for spreadsheets: 5000.50, no symbol or separators.
export function koboToPlain(kobo) {
  return (Number(kobo || 0) / 100).toFixed(2);
}

const ONES = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = [
  [1e12, "trillion"],
  [1e9, "billion"],
  [1e6, "million"],
  [1e3, "thousand"],
];

function underThousand(n) {
  const parts = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} hundred`);
    n %= 100;
    if (n) parts.push("and");
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ""));
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(" ");
}

function integerWords(n) {
  if (n === 0) return "zero";
  const parts = [];
  for (const [size, name] of SCALES) {
    if (n >= size) {
      parts.push(`${underThousand(Math.floor(n / size))} ${name}`);
      n %= size;
    }
  }
  if (n > 0) {
    // British usage: "one thousand and five".
    if (parts.length && n < 100) parts.push("and");
    parts.push(underThousand(n));
  }
  return parts.join(" ");
}

// 525050 -> "Five thousand two hundred and fifty naira, fifty kobo only"
export function amountInWords(kobo) {
  const total = Math.round(Number(kobo || 0));
  const naira = Math.floor(total / 100);
  const k = total % 100;

  let words = naira || !k ? `${integerWords(naira)} naira` : "";
  if (k) words += `${words ? ", " : ""}${integerWords(k)} kobo`;
  words += " only";
  return words.charAt(0).toUpperCase() + words.slice(1);
}
