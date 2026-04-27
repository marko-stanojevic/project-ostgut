export function requireRecord(value: unknown, field: string, label = 'API payload'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: ${field} must be an object`)
  }

  return value as Record<string, unknown>
}

export function requireArray(value: unknown, field: string, label = 'API payload'): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${label}: ${field} must be an array`)
  }

  return value
}

export function requireString(value: unknown, field: string, label = 'API payload'): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${label}: ${field} must be a string`)
  }

  return value
}

export function requireNonEmptyString(value: unknown, field: string, label = 'API payload'): string {
  const text = requireString(value, field, label)
  if (text.length === 0) {
    throw new Error(`Invalid ${label}: ${field} must be a non-empty string`)
  }

  return text
}

export function optionalString(value: unknown, field: string, label = 'API payload'): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  return requireString(value, field, label)
}

export function requireStringArray(value: unknown, field: string, label = 'API payload'): string[] {
  const items = requireArray(value, field, label)
  return items.map((item, index) => requireString(item, `${field}[${index}]`, label))
}

export function requireNumber(value: unknown, field: string, label = 'API payload'): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid ${label}: ${field} must be a finite number`)
  }

  return value
}

export function optionalNumber(value: unknown, field: string, label = 'API payload'): number | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  return requireNumber(value, field, label)
}

export function requireBoolean(value: unknown, field: string, label = 'API payload'): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid ${label}: ${field} must be a boolean`)
  }

  return value
}

export function optionalBoolean(value: unknown, field: string, label = 'API payload'): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  return requireBoolean(value, field, label)
}
