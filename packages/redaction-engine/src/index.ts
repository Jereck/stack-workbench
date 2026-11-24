export const redactionOptions = {
  authorization: "Authorization headers and bearer tokens",
  apiKeys: "API keys and access tokens",
  passwords: "Passwords",
  clientSecrets: "Client secrets",
  cookies: "Cookies",
  connectionStrings: "Connection strings",
  emails: "Email addresses",
} as const;

export type RedactionCategory = keyof typeof redactionOptions;
export const allRedactions = Object.keys(
  redactionOptions,
) as RedactionCategory[];
const replacement = "[REDACTED]";

function sensitiveKey(key: string): RedactionCategory | undefined {
  const name = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (
    /(?:authorization(?:header)?|bearertoken)$/.test(name) ||
    name === "authheader"
  )
    return "authorization";
  if (
    /(?:apikey|subscriptionkey|accesstoken|refreshtoken|securitytoken|authtoken|accesskey|secretaccesskey)$/.test(
      name,
    )
  )
    return "apiKeys";
  if (/(?:password|passwd|passphrase|userpwd)$/.test(name) || name === "pwd")
    return "passwords";
  if (/(?:clientsecret|clientcredential|consumersecret)$/.test(name))
    return "clientSecrets";
  if (/(?:setcookie|cookies?)$/.test(name)) return "cookies";
  if (
    /connectionstrings?$/.test(name) ||
    /^(?:databaseurl|dburl|dsn|jdbcurl)$/.test(name)
  )
    return "connectionStrings";
  if (/(?:email|emailaddress|mailaddress)$/.test(name)) return "emails";
}

const email = /[\w.!#$%&'*+\/=?^{}|~-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63})+/gi;
const bearer = /\bBearer[ \t]+[^\s"'<>,;\\]+/i;
const connection =
  /\b(?:jdbc:|(?:postgres(?:ql)?|mariadb|mysql|mongodb(?:\+srv)?|redis(?:s)?|sqlserver|amqps?):\/\/)|\b(?:data\s*source|server|host)\s*=[^;\r\n]{0,512};[^\r\n]{0,200}\b(?:user\s*id|uid|integrated\s*security|database|initial\s*catalog)\s*=/i;
const credentialsInUrl =
  /\b[a-z][a-z\d+.-]{0,24}:\/\/[^\s/@:]{1,256}:[^\s/@]{1,256}@/i;

function includesSecret(
  text: string,
  categories: ReadonlySet<RedactionCategory>,
) {
  if (categories.has("authorization") && bearer.test(text)) return true;
  if (
    categories.has("connectionStrings") &&
    (connection.test(text) || credentialsInUrl.test(text))
  )
    return true;
  const labels =
    /(?:^|[^\w.-])(?:<\/?(?:[\w.-]+:)?([a-z][\w.-]{0,79})\b|([a-z][\w.-]{0,79})["']?\s*(?:[:=]|[ \t]+(?:header|token)\s*[:=]))/gi;
  for (const match of text.matchAll(labels)) {
    const key = match[1] ?? match[2];
    const category = key && sensitiveKey(key);
    if (category && categories.has(category)) return true;
  }
  const named =
    /(?:\b(?:name|key|header|field)["']?\s*[:=]\s*["']([a-z][\w.-]{0,79})["']|\[\s*["']([a-z][\w.-]{0,79})["']\s*,)/gi;
  for (const match of text.matchAll(named)) {
    const key = match[1] ?? match[2];
    const category = key && sensitiveKey(key);
    if (category && categories.has(category)) return true;
  }
  return false;
}

function unescapeLayer(text: string) {
  return text
    .replace(
      /\\(?:u([\da-f]{4})|x([\da-f]{2})|(["'\\]))/gi,
      (
        _,
        wide: string | undefined,
        narrow: string | undefined,
        literal: string | undefined,
      ) =>
        literal ??
        String.fromCharCode(Number.parseInt(wide ?? narrow ?? "", 16)),
    )
    .replace(
      /&(?:#x([\da-f]{1,6})|#(\d{1,7})|(lt|gt|quot|apos|amp));/gi,
      (
        entity,
        hex: string | undefined,
        decimal: string | undefined,
        named: string | undefined,
      ) => {
        const names: Record<string, string> = {
          lt: "<",
          gt: ">",
          quot: '"',
          apos: "'",
          amp: "&",
        };
        if (named) return names[named.toLowerCase()] ?? entity;
        const code = hex ? Number.parseInt(hex, 16) : Number(decimal);
        return code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : entity;
      },
    )
    .replace(/%([\da-f]{2})/gi, (_, encoded: string) =>
      String.fromCharCode(Number.parseInt(encoded, 16)),
    );
}

export function redactText(
  text: string,
  categories: ReadonlySet<RedactionCategory>,
): string {
  if (categories.size === 0) return text;
  // Free-form text may wrap a secret across lines or syntax layers. Mask the
  // complete value when the boundaries of the sensitive field are ambiguous.
  const emails = categories.has("emails");
  const direct = emails ? text.replace(email, replacement) : text;
  let decoded = direct;
  for (let layer = 0; layer <= 4; layer++) {
    if (
      includesSecret(decoded, categories) ||
      (layer > 0 && emails && decoded.replace(email, replacement) !== decoded)
    )
      return replacement;
    const next = unescapeLayer(decoded);
    if (next === decoded) break;
    decoded = next;
  }
  return direct;
}

/** Copy JSON-shaped data, masking known keys as well as values embedded in text. */
export function redact(
  value: unknown,
  categories: ReadonlySet<RedactionCategory>,
): unknown {
  if (categories.size === 0) return value;
  if (typeof value === "string") return redactText(value, categories);
  if (Array.isArray(value)) {
    const category =
      value.length === 2 && typeof value[0] === "string"
        ? sensitiveKey(value[0])
        : undefined;
    if (category && categories.has(category)) return [value[0], replacement];
    return value.map((item: unknown) => redact(item, categories));
  }
  if (!value || typeof value !== "object") return value;
  const fields = new Map<string, unknown>();
  const suffixes = new Map<string, number>();
  const entries = Object.entries(value);
  const label = entries.find(([key]) =>
    /^(?:name|key|header|field)$/i.test(key),
  )?.[1];
  const namedCategory =
    typeof label === "string" ? sensitiveKey(label) : undefined;
  for (const [key, field] of entries) {
    const category =
      sensitiveKey(key) ??
      (/^(?:value|values|content)$/i.test(key) ? namedCategory : undefined);
    const safeKey = redactText(key, categories);
    let uniqueKey = safeKey;
    let suffix = suffixes.get(safeKey) ?? 2;
    while (fields.has(uniqueKey)) uniqueKey = safeKey + " " + suffix++;
    if (uniqueKey !== safeKey) suffixes.set(safeKey, suffix);
    fields.set(
      uniqueKey,
      category && categories.has(category)
        ? replacement
        : redact(field, categories),
    );
  }
  return Object.fromEntries(fields);
}
